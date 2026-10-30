// Payments: requests to accounting, vendors, files (private "accounting" bucket under
// <request id>/), the invoice reader and the downloads. Row level security decides who sees
// what: accounting everything, everyone else their own requests.
import JSZip from 'jszip';
import { supabase } from './supabase';
import { arubaToday } from './format';
import { addDays } from './schedule';
import type { Currency, Extraction, PayMethod, PaymentComment, PaymentFile, PaymentRequest, Vendor, VendorChoice } from '@/types';

const BUCKET = 'accounting';

const ok = <T>({ data, error }: { data: T | null; error: { message: string } | null }): T => {
  if (error) throw new Error(error.message);
  return data as T;
};

// --- wording and money -----------------------------------------------------------
export const CURRENCIES: Currency[] = ['AWG', 'USD', 'EUR'];
const SYMBOL: Record<Currency, string> = { AWG: 'Afl. ', USD: '$', EUR: '€' };
export const money = (n: number, c: Currency) =>
  `${SYMBOL[c]}${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
/** "Afl. 1,200.00 + $350.00" */
export const totals = (rows: Pick<PaymentRequest, 'amount' | 'currency'>[]) => {
  const by = new Map<Currency, number>();
  for (const r of rows) by.set(r.currency, (by.get(r.currency) ?? 0) + Number(r.amount));
  return CURRENCIES.filter((c) => by.has(c)).map((c) => money(by.get(c)!, c)).join(' + ') || money(0, 'AWG');
};

export const METHODS: Record<PayMethod, string> = { transfer: 'Bank transfer', cash: 'Cash', card: 'Card', check: 'Check', online: 'Online / link' };
export const CATEGORIES = [
  'Drinks & bar stock', 'Food', 'Maintenance & repairs', 'Cleaning & supplies', 'DJs & entertainment', 'Security',
  'Marketing & printing', 'Utilities', 'Rent', 'Equipment', 'Staff', 'Licenses & fees', 'Other',
];

/** When it has to be paid: today (urgent or due), this week, later, or no date. */
export function when(r: Pick<PaymentRequest, 'urgent' | 'due_date' | 'status'>, today = arubaToday()) {
  if (r.status === 'on_hold') return 'hold' as const;
  if (r.urgent || (r.due_date && r.due_date <= today)) return 'today' as const;
  if (r.due_date && r.due_date <= addDays(today, 7)) return 'week' as const;
  return 'later' as const;
}

// --- requests --------------------------------------------------------------------
export const listRequests = async () =>
  ok(await supabase.from('payment_requests').select('*').order('created_at', { ascending: false }).limit(2000)) as PaymentRequest[];

export const saveRequest = async (r: Partial<PaymentRequest>) =>
  ok(await supabase.from('payment_requests').upsert(r).select().single()) as PaymentRequest;
export const updateRequest = async (id: string, patch: Partial<PaymentRequest>) =>
  ok(await supabase.from('payment_requests').update(patch).eq('id', id).select().single()) as PaymentRequest;

export async function deleteRequest(r: PaymentRequest, files: PaymentFile[]) {
  if (files.length) await supabase.storage.from(BUCKET).remove(files.map((f) => f.path));
  ok(await supabase.from('payment_requests').delete().eq('id', r.id));
}

export const findDuplicates = async (payee: string, invoice: string | null, amount: number, currency: Currency) =>
  ok(await supabase.rpc('payment_duplicates', { p_payee: payee, p_invoice: invoice ?? '', p_amount: amount, p_currency: currency })) as
    { id: string; created_at: string; status: string; amount: number; currency: Currency; invoice_number: string | null; mine: boolean }[];

export const countDueToday = async () => {
  const today = arubaToday();
  const { data } = await supabase.from('payment_requests').select('urgent,due_date,status').eq('status', 'open');
  return (data ?? []).filter((r) => r.urgent || (r.due_date && r.due_date <= today)).length;
};

// --- files -----------------------------------------------------------------------
export const listFiles = async (requestIds?: string[]) => {
  let q = supabase.from('payment_files').select('*').order('created_at');
  if (requestIds) q = q.in('request_id', requestIds);
  return ok(await q) as PaymentFile[];
};

/** Photos are turned into a JPEG of at most 2400px (phone photos and HEIC included); PDFs as they are. */
export async function prepareFile(file: File): Promise<File> {
  if (file.type === 'application/pdf' || !file.type.startsWith('image/')) return file;
  const img = await createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => null);
  if (!img) return file;
  const k = Math.min(1, 2400 / Math.max(img.width, img.height));
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * k);
  c.height = Math.round(img.height * k);
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
  const blob = await new Promise<Blob | null>((res) => c.toBlob(res, 'image/jpeg', 0.88));
  return blob ? new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' }) : file;
}

export async function addFile(requestId: string, file: File, kind: PaymentFile['kind'] = 'invoice') {
  const ext = (file.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '');
  const path = `${requestId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type || 'application/octet-stream' });
  if (error) throw new Error(error.message);
  return ok(await supabase.from('payment_files').insert({ request_id: requestId, path, name: file.name.slice(0, 200), mime: file.type || 'application/octet-stream', size: file.size, kind }).select().single()) as PaymentFile;
}

export async function removeFile(f: PaymentFile) {
  await supabase.storage.from(BUCKET).remove([f.path]);
  ok(await supabase.from('payment_files').delete().eq('id', f.id));
}

export async function fileLinks(paths: string[]) {
  if (!paths.length) return new Map<string, string>();
  const { data } = await supabase.storage.from(BUCKET).createSignedUrls(paths, 3600);
  return new Map((data ?? []).flatMap((d) => (d.path && d.signedUrl ? [[d.path, d.signedUrl] as [string, string]] : [])));
}

// --- comments --------------------------------------------------------------------
export const listPaymentComments = async (requestId: string) =>
  ok(await supabase.from('payment_comments').select('*').eq('request_id', requestId).order('created_at')) as PaymentComment[];
export const addPaymentComment = async (requestId: string, body: string) =>
  ok(await supabase.from('payment_comments').insert({ request_id: requestId, body }).select().single()) as PaymentComment;

// --- vendors ---------------------------------------------------------------------
export const listVendorChoices = async () => ok(await supabase.rpc('vendor_choices')) as VendorChoice[];
export const listVendors = async () => ok(await supabase.from('vendors').select('*').order('name')) as Vendor[];
export const getVendor = async (id: string) => ok(await supabase.from('vendors').select('*').eq('id', id).maybeSingle()) as Vendor | null;
export const saveVendor = async (v: Partial<Vendor>) => {
  const { data, error } = await supabase.from('vendors').upsert(v).select().single();
  if (error) throw new Error(error.code === '23505' ? 'There’s already a vendor with that name.' : error.message);
  return data as Vendor;
};

// --- invoice reader ----------------------------------------------------------------
const toBase64 = (file: File) => new Promise<string>((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(String(r.result).split(',')[1] ?? '');
  r.onerror = () => rej(new Error('Couldn’t read the file'));
  r.readAsDataURL(file);
});

/** Reads invoices and screenshots with Claude. Throws with a plain message when it can't. */
export async function readInvoice(files: File[]) {
  const readable = files.filter((f) => f.type === 'application/pdf' || ['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(f.type));
  if (!readable.length) throw new Error('Only PDFs and photos can be read.');
  const payload = await Promise.all(readable.slice(0, 5).map(async (f) => ({ name: f.name, mime: f.type, data: await toBase64(f) })));
  const { data, error } = await supabase.functions.invoke('read-invoice', { body: { files: payload } });
  if (error) {
    const detail = await (error as { context?: Response }).context?.json?.().catch(() => null);
    throw new Error(detail?.error ?? 'Couldn’t read the file. Fill in the details by hand.');
  }
  return data as { extraction: Extraction; vendor: { id: string; name: string } | null };
}

// --- downloads ---------------------------------------------------------------------
const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function requestsCsv(rows: PaymentRequest[], people: Map<string, string>) {
  const head = ['Status', 'Pay by', 'Urgent', 'Payee', 'Amount', 'Currency', 'For', 'Category', 'Invoice no.', 'Invoice date', 'Method',
    'Bank', 'Account holder', 'Account no.', 'IBAN', 'SWIFT', 'Payment reference', 'Notes', 'Requested by', 'Requested on', 'Paid on', 'Paid reference', 'ID'];
  const lines = rows.map((r) => [
    r.status, r.due_date, r.urgent ? 'yes' : '', r.payee, Number(r.amount).toFixed(2), r.currency, r.description, r.category, r.invoice_number, r.invoice_date,
    METHODS[r.method], r.bank_name, r.account_holder, r.account_number, r.iban, r.swift, r.payment_reference, r.notes,
    people.get(r.submitted_by ?? '') ?? '', r.created_at.slice(0, 10), r.paid_on, r.paid_reference, r.id,
  ].map(csvCell).join(','));
  return '﻿' + [head.join(','), ...lines].join('\n');
}

const safe = (s: string) => s.replace(/[^\w.\- ]+/g, '').replace(/\s+/g, ' ').trim().slice(0, 60) || 'file';

/** A ZIP: one folder per request with its files, plus a spreadsheet (CSV) of all of them. */
export async function downloadZip(rows: PaymentRequest[], people: Map<string, string>, name: string) {
  const zip = new JSZip();
  zip.file('payments.csv', requestsCsv(rows, people));
  const files = await listFiles(rows.map((r) => r.id));
  const links = await fileLinks(files.map((f) => f.path));
  for (const r of rows) {
    const folder = zip.folder(safe(`${r.due_date ?? r.created_at.slice(0, 10)} ${r.payee} ${money(r.amount, r.currency)}`))!;
    for (const f of files.filter((x) => x.request_id === r.id)) {
      const link = links.get(f.path);
      if (!link) continue;
      const blob = await fetch(link).then((res) => res.blob());
      folder.file(`${f.kind === 'proof' ? 'proof-of-payment ' : ''}${safe(f.name)}`, blob);
    }
  }
  const blob = await zip.generateAsync({ type: 'blob' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${name}.zip`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}

export const extractionToRequest = (x: Extraction): Partial<PaymentRequest> => ({
  payee: x.vendor_name ?? undefined,
  amount: x.total_amount ?? undefined,
  currency: x.currency ?? undefined,
  description: x.description ?? undefined,
  invoice_number: x.invoice_number,
  invoice_date: x.invoice_date,
  due_date: x.due_date,
  bank_name: x.bank_name,
  account_holder: x.account_holder,
  account_number: x.account_number,
  iban: x.iban,
  swift: x.swift,
  payment_reference: x.payment_reference,
});
