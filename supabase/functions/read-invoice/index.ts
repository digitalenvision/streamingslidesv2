// Reads an invoice, bill or screenshot for a payment request: who to pay, how much, by
// when and the bank details, so the form fills itself in. Anyone with a Command account
// (signed in with 2FA) may use it; nothing is stored here, the person checks the result.
//
//   POST {files: [{name, mime, data (base64)}]}  (up to 5 files, 15 MB together)
//   → {extraction, vendor: {id, name} | null}
//
// Runs through OpenRouter. Secrets:
//   OPENROUTER_API_KEY  required; without it the app falls back to typing it in
//   OPENROUTER_MODEL    optional, default ~anthropic/claude-haiku-latest: an alias that always
//                       points at the newest Claude Haiku (cheap, reads photos and PDFs). Any
//                       OpenRouter model that takes images, files and JSON schemas works.
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';

const url = Deno.env.get('SUPABASE_URL')!;
const service = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
const configured = (Deno.env.get('ADMIN_ORIGINS') ?? 'https://command.gustoaruba.com').split(',').map((s) => s.trim());
const isLocal = /^http:\/\/(kong|127\.0\.0\.1|localhost)[:/]/.test(url);
const allowed = (origin: string) =>
  configured.includes(origin) || (isLocal && /^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origin));

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MODEL = Deno.env.get('OPENROUTER_MODEL') || '~anthropic/claude-haiku-latest';
const MAX_BYTES = 15 * 1024 * 1024;

class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

const nullable = (type: string) => ({ type: [type, 'null'] });
// What we want back. Every field is required (null when the document doesn't show it).
const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['is_payable', 'vendor_name', 'invoice_number', 'invoice_date', 'due_date', 'currency', 'total_amount', 'description',
    'line_items', 'bank_name', 'account_holder', 'account_number', 'iban', 'swift', 'payment_reference', 'already_paid', 'notes', 'confidence'],
  properties: {
    is_payable: { type: 'boolean', description: 'False if this is not something to pay (a receipt for something already paid counts as false only when nothing is owed).' },
    vendor_name: nullable('string'),
    invoice_number: nullable('string'),
    invoice_date: { ...nullable('string'), description: 'YYYY-MM-DD' },
    due_date: { ...nullable('string'), description: 'YYYY-MM-DD' },
    currency: { type: ['string', 'null'], enum: ['AWG', 'USD', 'EUR', null] },
    total_amount: { ...nullable('number'), description: 'The total still to pay, including tax' },
    description: { ...nullable('string'), description: 'What it is for, in a few words (e.g. "Beer delivery 12 cases Balashi")' },
    line_items: {
      type: 'array',
      items: { type: 'object', additionalProperties: false, required: ['description', 'amount'], properties: { description: { type: 'string' }, amount: nullable('number') } },
    },
    bank_name: nullable('string'),
    account_holder: nullable('string'),
    account_number: nullable('string'),
    iban: nullable('string'),
    swift: nullable('string'),
    payment_reference: { ...nullable('string'), description: 'What the vendor asks to put in the transfer description' },
    already_paid: { type: 'boolean', description: 'The document says it is paid, or is a receipt' },
    notes: { ...nullable('string'), description: 'Anything accounting should know: partial payment, late fee, discount, deposit, unclear total…' },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
  },
};

const PROMPT = `These files are for a payment request at Gusto, a nightclub in Aruba. They can be an invoice, a bill, a quote, a receipt, a screenshot of a WhatsApp or email asking for payment, or a photo of a paper invoice.

Read them and fill in the fields. Rules:
- Copy names, numbers and bank details exactly as written. Never guess or complete an account number, IBAN or SWIFT code: use null when it isn't clearly shown.
- Currency: Afl., ƒ, AWG or florin = AWG; $ or US$ = USD (in Aruba, "$" without more context is usually USD); € = EUR.
- total_amount is what is owed in total (after tax and discounts, minus anything already paid), not a subtotal.
- Dates as YYYY-MM-DD. Aruban documents usually write dates day-first (03/04/2026 = 3 April 2026).
- Several files usually belong to one payment (an invoice plus its bank details); combine them.
- confidence: high when the total and payee are clearly printed, low when you had to work from a blurry or partial image.`;

Deno.serve(async (req) => {
  const origin = req.headers.get('origin') ?? '';
  const cors = {
    'Access-Control-Allow-Origin': allowed(origin) ? origin : configured[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const reply = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

  try {
    if (req.method !== 'POST') throw new HttpError(405, 'POST only');
    if (origin && !allowed(origin)) throw new HttpError(403, 'Origin not allowed');
    await adminFrom(req);
    const apiKey = Deno.env.get('OPENROUTER_API_KEY');
    if (!apiKey) throw new HttpError(503, 'Reading invoices isn’t set up yet. Fill in the details by hand.');

    const body = await req.json().catch(() => ({}));
    const files = Array.isArray(body.files) ? body.files.slice(0, 5) : [];
    if (!files.length) throw new HttpError(400, 'No files');
    let total = 0;
    const content: unknown[] = [];
    for (const f of files) {
      const data = String(f.data ?? '');
      total += Math.ceil(data.length * 0.75);
      if (total > MAX_BYTES) throw new HttpError(413, 'Files too large to read (15 MB together).');
      if (f.mime === 'application/pdf') content.push({ type: 'file', file: { filename: String(f.name ?? 'invoice.pdf'), file_data: `data:application/pdf;base64,${data}` } });
      else if (IMAGE_TYPES.includes(f.mime)) content.push({ type: 'image_url', image_url: { url: `data:${f.mime};base64,${data}` } });
    }
    if (!content.length) throw new HttpError(400, 'Only PDFs and photos (JPEG, PNG, WebP) can be read.');
    content.push({ type: 'text', text: PROMPT });

    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://command.gustoaruba.com',
        'X-Title': 'Gusto Command',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 4000,
        messages: [{ role: 'user', content }],
        response_format: { type: 'json_schema', json_schema: { name: 'invoice', strict: true, schema: SCHEMA } },
        // PDFs go to the model as they are (it reads the layout and scans), not as extracted text.
        plugins: [{ id: 'file-parser', pdf: { engine: 'native' } }],
        // Only providers that honour the JSON schema.
        provider: { require_parameters: true },
      }),
      signal: AbortSignal.timeout(90_000),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      console.error('openrouter', res.status, detail.slice(0, 500));
      if (res.status === 402) throw new HttpError(502, 'The invoice reader is out of credit. Fill in the details by hand.');
      if (res.status === 429) throw new HttpError(429, 'Too many files read at once. Try again in a minute.');
      throw new HttpError(502, 'Couldn’t read the file. Fill in the details by hand.');
    }
    const out = await res.json();
    const raw = out?.choices?.[0]?.message?.content;
    const text = Array.isArray(raw) ? raw.map((p: { text?: string }) => p.text ?? '').join('') : String(raw ?? '');
    let extraction: Record<string, unknown>;
    try {
      extraction = JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, ''));
    } catch {
      console.error('openrouter: not JSON', text.slice(0, 300));
      throw new HttpError(502, 'Couldn’t read the file. Fill in the details by hand.');
    }
    return reply({ extraction, vendor: await matchVendor(extraction) });
  } catch (e) {
    let status = e instanceof HttpError ? e.status : 500;
    let message = e instanceof HttpError ? e.message : 'Couldn’t read the file. Fill in the details by hand.';
    if (e instanceof DOMException && e.name === 'TimeoutError') { status = 504; message = 'Reading took too long. Fill in the details by hand.'; }
    else if (status === 500) console.error(e);
    return reply({ error: message }, status);
  }
});

/** Anyone with a Command account, signed in with their authenticator app. */
async function adminFrom(req: Request) {
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) throw new HttpError(401, 'Sign in first');
  const { data, error } = await service.auth.getClaims(token);
  if (error || !data?.claims?.sub) throw new HttpError(401, 'Sign in first');
  if (data.claims.aal !== 'aal2') throw new HttpError(403, 'Confirm with your authenticator app first');
  const { data: row } = await service.from('admin_users').select('user_id').eq('user_id', data.claims.sub).maybeSingle();
  if (!row) throw new HttpError(403, 'No access');
}

const digits = (s: unknown) => String(s ?? '').replace(/[^0-9A-Za-z]/g, '').toUpperCase();
const words = (s: unknown) => String(s ?? '').toLowerCase().replace(/\b(n\.?v\.?|v\.?b\.?a\.?|inc|ltd|llc|b\.?v\.?)\b/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

/** A saved vendor with the same account number, or the same name. */
async function matchVendor(x: Record<string, unknown>) {
  const { data } = await service.from('vendors').select('id,name,account_number,iban').eq('active', true);
  const vendors = data ?? [];
  const acct = digits(x.account_number), iban = digits(x.iban);
  const byAccount = vendors.find((v) => (acct && digits(v.account_number) === acct) || (iban && digits(v.iban) === iban));
  if (byAccount) return { id: byAccount.id, name: byAccount.name };
  const name = words(x.vendor_name);
  if (!name) return null;
  const byName = vendors.find((v) => { const n = words(v.name); return n === name || (n.length > 3 && (name.includes(n) || n.includes(name))); });
  return byName ? { id: byName.id, name: byName.name } : null;
}
