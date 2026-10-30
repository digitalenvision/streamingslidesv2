// Payments: anyone with an account asks accounting to pay something; accounting sees what
// has to go out today, this week and later, pays it and keeps the paperwork.
//
// New request: drop in the invoice, bill or screenshot and Claude fills in the form (payee,
// amount, dates, bank details), matching a saved vendor where it can. Everything stays
// editable; nothing is saved until the person sends it.
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  AlertTriangle, Ban, Banknote, CheckCircle2, Copy, Download, FileText, Flame, ImageIcon, Paperclip, PauseCircle, Pencil, Plus,
  RotateCcw, Send, Sparkles, Trash2, Upload, X,
} from 'lucide-react';
import { PageHeader } from '@/components/AppShell';
import { Badge, Button, Dialog, Empty, Field, IconButton, Input, Segmented, Spinner, Switch, Textarea, useConfirm, useToast } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { arubaToday, cn, formatDate, relativeTime } from '@/lib/format';
import {
  CATEGORIES, CURRENCIES, METHODS, addFile, addPaymentComment, deleteRequest, downloadZip, extractionToRequest, fileLinks, findDuplicates,
  listFiles, listPaymentComments, listRequests, listVendorChoices, money, prepareFile, readInvoice, removeFile, saveRequest, saveVendor,
  totals, updateRequest, when,
} from '@/lib/payments';
import { listAdminNames, listDepartments } from '@/lib/staff';
import { useLoad } from '@/lib/useLoad';
import type { Currency, Department, Extraction, PayMethod, PaymentComment, PaymentFile, PaymentRequest, VendorChoice } from '@/types';

interface Ctx {
  accounting: boolean;
  me: string;
  people: Map<string, string>;
  departments: Department[];
  vendors: VendorChoice[];
}

const STATUS: Record<PaymentRequest['status'], { label: string; tone?: 'ok' | 'bad' | 'warn' | 'gold' }> = {
  open: { label: 'To pay', tone: 'gold' },
  on_hold: { label: 'On hold', tone: 'warn' },
  paid: { label: 'Paid', tone: 'ok' },
  rejected: { label: 'Rejected', tone: 'bad' },
};

/** "Today", "3 days overdue", "Fri, Oct 30", "No date" */
function payBy(r: PaymentRequest, today = arubaToday()) {
  if (r.status === 'paid') return r.paid_on ? `Paid ${formatDate(r.paid_on, { month: 'short', day: 'numeric' })}` : 'Paid';
  if (r.urgent) return 'Today (urgent)';
  if (!r.due_date) return 'No due date';
  if (r.due_date === today) return 'Due today';
  if (r.due_date < today) {
    const days = Math.round((Date.parse(today) - Date.parse(r.due_date)) / 86_400_000);
    return `${days} ${days === 1 ? 'day' : 'days'} overdue`;
  }
  return `Due ${formatDate(r.due_date, { weekday: 'short', month: 'short', day: 'numeric' })}`;
}

export function Payments() {
  const { access, session } = useAuth();
  const accounting = !!access && (access.role === 'owner' || access.accounting);
  const me = session?.user.id ?? '';
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState<'topay' | 'paid' | 'rejected' | 'all'>('topay');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<Partial<PaymentRequest> | null>(params.has('new') ? {} : null);
  const [paying, setPaying] = useState<PaymentRequest[] | null>(null);
  const [busy, setBusy] = useState(false);

  const { data, reload, set } = useLoad(async () => {
    const [requests, people, departments, vendors, files] = await Promise.all([
      listRequests(), listAdminNames(), listDepartments(), listVendorChoices(), listFiles(),
    ]);
    const fileCount = new Map<string, number>();
    for (const f of files) fileCount.set(f.request_id, (fileCount.get(f.request_id) ?? 0) + 1);
    return { requests, people: new Map(people.map((p) => [p.user_id, p.name ?? p.email?.split('@')[0] ?? 'Someone'])), departments, vendors, fileCount };
  });
  const ctx: Ctx | null = data ? { accounting, me, people: data.people, departments: data.departments, vendors: data.vendors } : null;
  const replace = (r: PaymentRequest) => set((d) => d && { ...d, requests: d.requests.some((x) => x.id === r.id) ? d.requests.map((x) => (x.id === r.id ? r : x)) : [r, ...d.requests] });

  const shown = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    return data.requests.filter((r) =>
      (tab === 'topay' ? r.status === 'open' || r.status === 'on_hold' : tab === 'paid' ? r.status === 'paid' : tab === 'rejected' ? r.status === 'rejected' : true)
      && (!q || `${r.payee} ${r.description} ${r.invoice_number ?? ''} ${r.category ?? ''} ${r.amount}`.toLowerCase().includes(q)));
  }, [data, tab, query]);
  const open = data?.requests.find((r) => r.id === params.get('id')) ?? null;
  const picked = shown.filter((r) => selected.has(r.id));
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const download = async (rows: PaymentRequest[], name: string) => {
    if (!data || !rows.length) return;
    setBusy(true);
    try { await downloadZip(rows, data.people, name); toast(`Downloaded ${rows.length} ${rows.length === 1 ? 'request' : 'requests'}`); }
    catch (e) { toast((e as Error).message, 'bad'); } finally { setBusy(false); }
  };

  const sections = useMemo(() => {
    if (tab !== 'topay') return null;
    const today = arubaToday();
    const sort = (a: PaymentRequest, b: PaymentRequest) => Number(b.urgent) - Number(a.urgent) || (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999') || a.created_at.localeCompare(b.created_at);
    const by = (k: ReturnType<typeof when>) => shown.filter((r) => when(r, today) === k).sort(sort);
    return [
      { key: 'today', title: 'Pay today', hint: 'Urgent, due today or overdue', rows: by('today'), tone: 'text-bad' },
      { key: 'week', title: 'This week', hint: 'Due in the next 7 days', rows: by('week'), tone: 'text-gold' },
      { key: 'later', title: 'Later', hint: 'Due later, or no due date', rows: by('later'), tone: 'text-white/70' },
      { key: 'hold', title: 'On hold', hint: 'Waiting for something before paying', rows: by('hold'), tone: 'text-warn' },
    ];
  }, [shown, tab]);

  return (
    <>
      <PageHeader
        kicker="Accounting"
        title="Payments"
        subtitle={accounting
          ? 'Everything waiting to be paid, and what’s been paid. Open a request for the invoice, bank details and to mark it paid.'
          : 'Ask accounting to pay something: add the invoice or a screenshot and the details fill themselves in. You see your own requests here.'}
        actions={<>
          {accounting && <Button icon={<Download className="size-4" />} loading={busy} disabled={!shown.length} onClick={() => download(picked.length ? picked : shown, `gusto-payments-${tab}-${arubaToday()}`)}>{picked.length ? `Download ${picked.length}` : 'Download'}</Button>}
          <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setEditing({})}>New payment request</Button>
        </>}
      />

      <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-center">
        <Segmented
          value={tab}
          onChange={(t) => { setTab(t); setSelected(new Set()); }}
          options={[
            { value: 'topay', label: <>To pay {data && <span className="ml-1 opacity-60">{data.requests.filter((r) => r.status === 'open' || r.status === 'on_hold').length}</span>}</> },
            { value: 'paid', label: 'Paid' },
            { value: 'rejected', label: 'Rejected' },
            { value: 'all', label: 'All' },
          ]}
        />
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search payee, invoice, amount…" className="h-10 sm:ml-auto sm:w-72" aria-label="Search payments" />
      </div>

      {accounting && picked.length > 0 && (
        <div className="sticky top-2 z-20 mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-gold/30 bg-ink-850/95 px-4 py-2.5 backdrop-blur">
          <span className="font-semibold">{picked.length} selected · {totals(picked)}</span>
          <span className="ml-auto flex gap-2">
            {picked.some((r) => r.status !== 'paid') && <Button size="sm" variant="primary" icon={<CheckCircle2 className="size-4" />} onClick={() => setPaying(picked.filter((r) => r.status !== 'paid'))}>Mark paid</Button>}
            <Button size="sm" icon={<Download className="size-4" />} loading={busy} onClick={() => download(picked, `gusto-payments-${arubaToday()}`)}>Download</Button>
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
          </span>
        </div>
      )}

      {!data || !ctx ? <div className="grid h-48 place-items-center"><Spinner /></div>
        : shown.length === 0 ? (
          <Empty icon={<Banknote />} title={tab === 'topay' ? 'Nothing to pay' : 'Nothing here'} body={tab === 'topay' ? 'New payment requests show up here, with what has to be paid today at the top.' : undefined} action={tab === 'topay' ? <Button variant="primary" onClick={() => setEditing({})}>New payment request</Button> : undefined} />
        ) : sections ? (
          <div className="grid gap-6">
            {sections.filter((s) => s.rows.length).map((s) => (
              <section key={s.key} className="grid gap-2">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <h2 className={cn('font-display text-[18px] font-bold', s.tone)}>{s.title}</h2>
                  <span className="text-[13px] text-white/50">{s.hint}</span>
                  <span className="ml-auto text-[14px] font-semibold tabular-nums">{totals(s.rows)}</span>
                </div>
                <List rows={s.rows} ctx={ctx} files={data.fileCount} selected={selected} onToggle={accounting ? toggle : undefined} onOpen={(r) => setParams({ id: r.id })} />
              </section>
            ))}
          </div>
        ) : (
          <div className="grid gap-2">
            <div className="flex justify-end text-[14px] font-semibold tabular-nums">{totals(shown)}</div>
            <List rows={shown} ctx={ctx} files={data.fileCount} selected={selected} onToggle={accounting ? toggle : undefined} onOpen={(r) => setParams({ id: r.id })} />
          </div>
        )}

      {ctx && editing && (
        <RequestForm
          initial={editing}
          ctx={ctx}
          onClose={() => { setEditing(null); if (params.has('new')) setParams({}); }}
          onSaved={(r) => { setEditing(null); replace(r); reload(); setParams({ id: r.id }); }}
        />
      )}
      {ctx && open && !editing && (
        <RequestDetail
          key={open.id}
          request={open}
          ctx={ctx}
          onClose={() => setParams({})}
          onChange={(r) => { replace(r); reload(); }}
          onEdit={() => setEditing(open)}
          onPay={() => setPaying([open])}
          onDeleted={() => { setParams({}); reload(); }}
        />
      )}
      {paying && (
        <PayDialog
          rows={paying}
          onClose={() => setPaying(null)}
          onDone={() => { setPaying(null); setSelected(new Set()); reload(); }}
        />
      )}
    </>
  );
}

function List({ rows, ctx, files, selected, onToggle, onOpen }: {
  rows: PaymentRequest[]; ctx: Ctx; files: Map<string, number>; selected: Set<string>; onToggle?: (id: string) => void; onOpen: (r: PaymentRequest) => void;
}) {
  const today = arubaToday();
  return (
    <div className="panel divide-y divide-line overflow-hidden">
      {rows.map((r) => {
        const late = r.status === 'open' && (r.urgent || (r.due_date && r.due_date <= today));
        return (
          <div key={r.id} className={cn('flex items-center gap-3 px-3 py-3 sm:px-4', selected.has(r.id) && 'bg-gold/[0.06]')}>
            {onToggle && (
              <input type="checkbox" checked={selected.has(r.id)} onChange={() => onToggle(r.id)} aria-label={`Select ${r.payee}`} className="size-4 shrink-0 accent-[var(--color-gold,#e0b03a)]" />
            )}
            <button onClick={() => onOpen(r)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
              <div className="grid min-w-0 flex-1 gap-0.5">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="truncate font-semibold">{r.payee}</span>
                  {r.urgent && r.status === 'open' && <Badge tone="bad"><Flame className="size-3" /> Urgent</Badge>}
                  {r.status !== 'open' && <Badge tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Badge>}
                </span>
                <span className="truncate text-[13px] text-white/65">{r.description}</span>
                <span className="flex flex-wrap items-center gap-x-3 text-[12px] text-white/45">
                  <span className={cn(late && 'font-semibold text-bad')}>{payBy(r, today)}</span>
                  {r.category && <span>{r.category}</span>}
                  {(files.get(r.id) ?? 0) > 0 && <span className="flex items-center gap-1"><Paperclip className="size-3" />{files.get(r.id)}</span>}
                  {ctx.accounting && <span>by {ctx.people.get(r.submitted_by ?? '') ?? 'someone'} · {relativeTime(r.created_at)}</span>}
                </span>
              </div>
              <span className="shrink-0 text-right text-[15px] font-bold tabular-nums">{money(r.amount, r.currency)}</span>
            </button>
          </div>
        );
      })}
    </div>
  );
}

// --- new / edit ------------------------------------------------------------------

type Draft = Partial<PaymentRequest> & { vendorChoice?: string };

function RequestForm({ initial, ctx, onClose, onSaved }: { initial: Partial<PaymentRequest>; ctx: Ctx; onClose: () => void; onSaved: (r: PaymentRequest) => void }) {
  const toast = useToast();
  const { confirm, dialog } = useConfirm();
  const editingExisting = !!initial.id;
  const [d, setD] = useState<Draft>({ currency: 'AWG', method: 'transfer', urgent: false, ...initial, vendorChoice: initial.id ? (initial.vendor_id ?? 'new') : '' });
  const [files, setFiles] = useState<File[]>([]);
  const [reading, setReading] = useState(false);
  const [read, setRead] = useState<{ x: Extraction; filled: string[] } | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const [saveAsVendor, setSaveAsVendor] = useState(false);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const touched = useRef(new Set<string>());
  const set = (patch: Draft) => { Object.keys(patch).forEach((k) => touched.current.add(k)); setD((x) => ({ ...x, ...patch })); };
  const vendor = ctx.vendors.find((v) => v.id === d.vendorChoice);
  const isNew = d.vendorChoice === 'new';

  const pickVendor = (id: string) => {
    const v = ctx.vendors.find((x) => x.id === id);
    if (v) setD((x) => ({ ...x, vendorChoice: id, vendor_id: id, payee: v.name, currency: touched.current.has('currency') ? x.currency : v.currency, method: v.method, category: x.category ?? v.category ?? null }));
    else setD((x) => ({ ...x, vendorChoice: id, vendor_id: null }));
  };

  const addFiles = async (list: FileList | File[]) => {
    const prepared = await Promise.all(Array.from(list).slice(0, 8).map(prepareFile));
    const next = [...files, ...prepared].slice(0, 8);
    setFiles(next);
    if (editingExisting) return;
    // Read what was dropped in (once; re-reads when more files are added).
    setReading(true);
    setReadError(null);
    try {
      const { extraction, vendor: match } = await readInvoice(next);
      const found = extractionToRequest(extraction);
      const filled: string[] = [];
      setD((x) => {
        const out: Draft = { ...x };
        for (const [k, v] of Object.entries(found)) {
          if (v === null || v === undefined || v === '' || touched.current.has(k)) continue;
          (out as Record<string, unknown>)[k] = v;
          filled.push(k);
        }
        if (!touched.current.has('vendorChoice')) {
          if (match) Object.assign(out, { vendorChoice: match.id, vendor_id: match.id, payee: match.name });
          else if (extraction.vendor_name) Object.assign(out, { vendorChoice: 'new', vendor_id: null });
        }
        if (!x.notes && extraction.notes) out.notes = extraction.notes;
        out.extracted = extraction;
        return out;
      });
      setRead({ x: extraction, filled });
      if (match) toast(`Matched saved vendor ${match.name}`);
    } catch (e) {
      setReadError((e as Error).message);
    } finally {
      setReading(false);
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const payee = (vendor?.name ?? d.payee ?? '').trim();
    const amount = Number(d.amount);
    if (!payee || !(amount > 0) || !d.description?.trim()) return;
    if (!editingExisting) {
      const dups = await findDuplicates(payee, d.invoice_number ?? null, amount, d.currency as Currency).catch(() => []);
      if (dups.length && !(await confirm(
        'This may already have been asked',
        <div className="grid gap-1.5">
          <span>{dups.length === 1 ? 'There’s a request' : `There are ${dups.length} requests`} for {payee} with the same {d.invoice_number ? 'invoice number or amount' : 'amount'}:</span>
          {dups.map((x) => <span key={x.id} className="text-white/70">· {money(x.amount, x.currency)}{x.invoice_number ? `, invoice ${x.invoice_number}` : ''}, {STATUS[x.status as PaymentRequest['status']]?.label.toLowerCase() ?? x.status}, {relativeTime(x.created_at)}{x.mine ? ' (yours)' : ''}</span>)}
          <span>Send it anyway?</span>
        </div>,
        'Send anyway',
      ))) return;
    }
    setBusy(true);
    try {
      let vendorId = vendor ? vendor.id : null;
      if (isNew && saveAsVendor && ctx.accounting) {
        const v = await saveVendor({
          name: payee, category: d.category ?? null, currency: d.currency as Currency, method: d.method as PayMethod,
          bank_name: d.bank_name ?? null, account_holder: d.account_holder ?? null, account_number: d.account_number ?? null, iban: d.iban ?? null, swift: d.swift ?? null,
        });
        vendorId = v.id;
      }
      const bank = isNew ? { bank_name: d.bank_name || null, account_holder: d.account_holder || null, account_number: d.account_number || null, iban: d.iban || null, swift: d.swift || null } : {};
      let saved = await saveRequest({
        ...(d.id ? { id: d.id } : {}),
        vendor_id: vendorId, payee, amount, currency: d.currency as Currency, description: d.description!.trim(), category: d.category || null,
        department_id: d.department_id || null, invoice_number: d.invoice_number?.trim() || null, invoice_date: d.invoice_date || null,
        due_date: d.due_date || null, urgent: !!d.urgent, method: d.method as PayMethod, payment_reference: d.payment_reference?.trim() || null,
        notes: d.notes?.trim() || null, save_vendor: isNew && saveAsVendor && !ctx.accounting, extracted: d.extracted ?? null,
        // A requester fixing a request that was put on hold sends it back to accounting.
        ...(editingExisting && !ctx.accounting && initial.status === 'on_hold' ? { status: 'open' as const, status_note: null } : {}),
        ...bank,
      });
      for (const f of files) await addFile(saved.id, f);
      if (!editingExisting) saved = { ...saved };
      toast(editingExisting ? 'Saved' : 'Sent to accounting');
      onSaved(saved);
    } catch (err) {
      toast((err as Error).message, 'bad');
    } finally {
      setBusy(false);
    }
  };

  const filled = (k: string) => read?.filled.includes(k) && <Sparkles className="ml-1 inline size-3 text-gold" aria-label="Filled in from the invoice" />;
  const canSend = !!(vendor || d.payee?.trim()) && Number(d.amount) > 0 && !!d.description?.trim() && !!d.vendorChoice;

  return (
    <Dialog
      open
      onClose={onClose}
      wide
      title={editingExisting ? 'Edit payment request' : 'New payment request'}
      footer={<>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" type="submit" form="payment-form" loading={busy} disabled={!canSend || reading} icon={<Send className="size-4" />}>{editingExisting ? 'Save' : 'Send to accounting'}</Button>
      </>}
    >
      <form id="payment-form" onSubmit={submit} className="grid gap-5">
        {/* Files first: they fill in the rest. */}
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files); }}
          className="grid gap-3 rounded-xl border border-dashed border-white/20 bg-white/[0.02] p-4"
        >
          <div className="flex flex-wrap items-center gap-3">
            <Upload className="size-5 text-gold" />
            <div className="grid min-w-0 flex-1 leading-tight">
              <span className="font-semibold">{editingExisting ? 'Add more files' : 'Add the invoice, bill or screenshot'}</span>
              <span className="text-[12.5px] text-white/55">{editingExisting ? 'PDF or photo.' : 'PDF or photo. The details below fill themselves in; check them before sending.'}</span>
            </div>
            <Button type="button" size="sm" icon={<Paperclip className="size-4" />} onClick={() => input.current?.click()}>Choose files</Button>
          </div>
          <input ref={input} type="file" multiple accept="application/pdf,image/*" className="sr-only" onChange={(e) => { if (e.target.files?.length) addFiles(e.target.files); e.target.value = ''; }} />
          {files.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {files.map((f, i) => (
                <span key={i} className="flex h-9 items-center gap-2 rounded-lg border border-line bg-ink-800 pl-2.5 pr-1 text-[12.5px]">
                  {f.type === 'application/pdf' ? <FileText className="size-4 text-white/60" /> : <ImageIcon className="size-4 text-white/60" />}
                  <span className="max-w-[180px] truncate">{f.name}</span>
                  <button type="button" aria-label={`Remove ${f.name}`} onClick={() => setFiles((x) => x.filter((_, j) => j !== i))} className="grid size-6 place-items-center rounded text-white/50 hover:text-white"><X className="size-3.5" /></button>
                </span>
              ))}
            </div>
          )}
          {reading && <p className="flex items-center gap-2 text-[13px] text-gold"><Spinner /> Reading the invoice…</p>}
          {readError && <p className="text-[13px] text-warn">{readError}</p>}
          {read && <ReadSummary x={read.x} />}
        </div>

        {/* Who */}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Pay to">
            {(id) => (
              <select id={id} className="field" required value={d.vendorChoice ?? ''} onChange={(e) => { touched.current.add('vendorChoice'); pickVendor(e.target.value); }}>
                <option value="" disabled>Choose a vendor…</option>
                <option value="new">Someone new (not in the list)</option>
                {ctx.vendors.map((v) => <option key={v.id} value={v.id}>{v.name}{v.category ? ` · ${v.category}` : ''}</option>)}
              </select>
            )}
          </Field>
          {isNew && <Field label={<>Payee name{filled('payee')}</>}>{(id) => <Input id={id} required maxLength={120} value={d.payee ?? ''} onChange={(e) => set({ payee: e.target.value })} placeholder="Company or person" />}</Field>}
          {vendor && <p className="self-end pb-2 text-[12.5px] text-white/55">{vendor.has_bank ? 'Bank details come from the saved vendor.' : 'No bank details saved for this vendor yet; add them in the notes if you have them.'}</p>}
        </div>

        {/* How much, for what */}
        <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
          <Field label={<>Amount{filled('amount')}</>}>{(id) => <Input id={id} required type="number" inputMode="decimal" min="0.01" step="0.01" value={d.amount ?? ''} onChange={(e) => set({ amount: e.target.value === '' ? undefined : Number(e.target.value) })} placeholder="0.00" />}</Field>
          <div className="grid gap-1.5">
            <span className="text-[13px] font-medium text-white/85">Currency{filled('currency')}</span>
            <Segmented<Currency> value={d.currency as Currency} onChange={(currency) => set({ currency })} options={CURRENCIES.map((c) => ({ value: c, label: c === 'AWG' ? 'AWG (Afl.)' : c }))} />
          </div>
        </div>
        <Field label={<>What is it for?{filled('description')}</>}>{(id) => <Input id={id} required maxLength={500} value={d.description ?? ''} onChange={(e) => set({ description: e.target.value })} placeholder="e.g. Beer delivery, 40 cases Balashi" />}</Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Category">{(id) => (
            <select id={id} className="field" value={d.category ?? ''} onChange={(e) => set({ category: e.target.value || null })}>
              <option value="">—</option>
              {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          )}</Field>
          <Field label="For which team (optional)">{(id) => (
            <select id={id} className="field" value={d.department_id ?? ''} onChange={(e) => set({ department_id: e.target.value || null })}>
              <option value="">The whole club</option>
              {ctx.departments.map((dep) => <option key={dep.id} value={dep.id}>{dep.plural}</option>)}
            </select>
          )}</Field>
        </div>

        {/* When */}
        <div className="grid gap-4 rounded-xl border border-line p-4 sm:grid-cols-3">
          <Field label={<>Invoice number{filled('invoice_number')}</>}>{(id) => <Input id={id} maxLength={80} value={d.invoice_number ?? ''} onChange={(e) => set({ invoice_number: e.target.value })} />}</Field>
          <Field label={<>Invoice date{filled('invoice_date')}</>}>{(id) => <Input id={id} type="date" value={d.invoice_date ?? ''} onChange={(e) => set({ invoice_date: e.target.value || null })} />}</Field>
          <Field label={<>Pay by{filled('due_date')}</>}>{(id) => <Input id={id} type="date" value={d.due_date ?? ''} onChange={(e) => set({ due_date: e.target.value || null })} />}</Field>
          <div className="sm:col-span-3">
            <Switch checked={!!d.urgent} onChange={(urgent) => set({ urgent })} label="Pay today (urgent)" description="Goes to the top of accounting’s list, whatever the due date says" />
          </div>
        </div>

        {/* How */}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="How to pay">{(id) => (
            <select id={id} className="field" value={d.method} onChange={(e) => set({ method: e.target.value as PayMethod })}>
              {(Object.keys(METHODS) as PayMethod[]).map((m) => <option key={m} value={m}>{METHODS[m]}</option>)}
            </select>
          )}</Field>
          <Field label={<>Reference for the transfer{filled('payment_reference')}</>} hint="What the vendor wants in the description">{(id) => <Input id={id} maxLength={140} value={d.payment_reference ?? ''} onChange={(e) => set({ payment_reference: e.target.value })} />}</Field>
        </div>

        {isNew && d.method === 'transfer' && (
          <div className="grid gap-4 rounded-xl border border-line p-4 sm:grid-cols-2">
            <span className="text-[13px] font-semibold sm:col-span-2">Bank details</span>
            <Field label={<>Bank{filled('bank_name')}</>}>{(id) => <Input id={id} value={d.bank_name ?? ''} onChange={(e) => set({ bank_name: e.target.value })} placeholder="Aruba Bank, CMB, RBC…" />}</Field>
            <Field label={<>Account holder{filled('account_holder')}</>}>{(id) => <Input id={id} value={d.account_holder ?? ''} onChange={(e) => set({ account_holder: e.target.value })} />}</Field>
            <Field label={<>Account number{filled('account_number')}</>}>{(id) => <Input id={id} value={d.account_number ?? ''} onChange={(e) => set({ account_number: e.target.value })} className="font-mono" />}</Field>
            <Field label={<>IBAN{filled('iban')}</>}>{(id) => <Input id={id} value={d.iban ?? ''} onChange={(e) => set({ iban: e.target.value })} className="font-mono" />}</Field>
            <Field label={<>SWIFT / BIC{filled('swift')}</>}>{(id) => <Input id={id} value={d.swift ?? ''} onChange={(e) => set({ swift: e.target.value })} className="font-mono" />}</Field>
            <div className="flex items-end pb-1">
              <Switch checked={saveAsVendor} onChange={setSaveAsVendor} label={ctx.accounting ? 'Save as a vendor' : 'Ask to save as a vendor'} description="So next time it can be picked from the list" />
            </div>
          </div>
        )}

        <Field label="Notes for accounting (optional)">{(id) => <Textarea id={id} rows={3} maxLength={2000} value={d.notes ?? ''} onChange={(e) => set({ notes: e.target.value })} placeholder="Anything they should know: deposit, partial payment, call before paying…" />}</Field>
      </form>
      {dialog}
    </Dialog>
  );
}

function ReadSummary({ x }: { x: Extraction }) {
  const warn: string[] = [];
  if (!x.is_payable) warn.push('This doesn’t look like something to pay.');
  if (x.already_paid) warn.push('The document says it’s already paid.');
  if (x.confidence === 'low') warn.push('Hard to read: check every field.');
  return (
    <div className="grid gap-1.5 rounded-lg bg-gold/[0.07] px-3 py-2.5 text-[13px]">
      <span className="flex items-center gap-1.5 font-semibold text-gold"><Sparkles className="size-4" /> Filled in from the invoice. Check before sending.</span>
      {warn.map((w) => <span key={w} className="flex items-center gap-1.5 text-warn"><AlertTriangle className="size-3.5" />{w}</span>)}
      {x.line_items.length > 0 && (
        <details className="text-white/70">
          <summary className="cursor-pointer text-white/55">{x.line_items.length} {x.line_items.length === 1 ? 'line' : 'lines'} on the invoice</summary>
          <ul className="mt-1 grid gap-0.5">{x.line_items.slice(0, 30).map((l, i) => <li key={i} className="flex justify-between gap-3"><span className="truncate">{l.description}</span>{l.amount != null && <span className="tabular-nums">{l.amount.toFixed(2)}</span>}</li>)}</ul>
        </details>
      )}
    </div>
  );
}

// --- detail ----------------------------------------------------------------------

function RequestDetail({ request: r, ctx, onClose, onChange, onEdit, onPay, onDeleted }: {
  request: PaymentRequest; ctx: Ctx; onClose: () => void; onChange: (r: PaymentRequest) => void; onEdit: () => void; onPay: () => void; onDeleted: () => void;
}) {
  const toast = useToast();
  const { confirm, dialog } = useConfirm();
  const [files, setFiles] = useState<PaymentFile[] | null>(null);
  const [links, setLinks] = useState(new Map<string, string>());
  const [comments, setComments] = useState<PaymentComment[] | null>(null);
  const [text, setText] = useState('');
  const [noting, setNoting] = useState<'on_hold' | 'rejected' | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const mine = r.submitted_by === ctx.me;
  const canEdit = ctx.accounting || (mine && (r.status === 'open' || r.status === 'on_hold'));

  const loadFiles = async () => {
    const list = await listFiles([r.id]);
    setFiles(list);
    setLinks(await fileLinks(list.map((f) => f.path)));
  };
  useEffect(() => { loadFiles(); listPaymentComments(r.id).then(setComments, () => setComments([])); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [r.id]);

  const status = async (patch: Partial<PaymentRequest>, done: string) => {
    try { onChange(await updateRequest(r.id, patch)); toast(done); } catch (e) { toast((e as Error).message, 'bad'); }
  };
  const copy = (v: string) => navigator.clipboard.writeText(v).then(() => toast('Copied'));
  const late = r.status === 'open' && (r.urgent || (r.due_date && r.due_date <= arubaToday()));

  return (
    <Dialog open onClose={onClose} wide title={r.payee}>
      <div className="grid gap-5">
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-display text-[30px] font-bold tabular-nums leading-none">{money(r.amount, r.currency)}</span>
          <Badge tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Badge>
          {r.urgent && r.status === 'open' && <Badge tone="bad"><Flame className="size-3" /> Urgent</Badge>}
          <span className={cn('text-[13px]', late ? 'font-semibold text-bad' : 'text-white/60')}>{payBy(r)}</span>
        </div>

        {(r.status === 'on_hold' || r.status === 'rejected') && r.status_note && (
          <div className={cn('rounded-xl px-4 py-3 text-[14px]', r.status === 'on_hold' ? 'bg-warn/10 text-warn' : 'bg-bad/10 text-bad')}>
            <b>{r.status === 'on_hold' ? 'On hold: ' : 'Rejected: '}</b>{r.status_note}
            {r.status === 'on_hold' && mine && !ctx.accounting && <div className="mt-1 text-[13px] text-white/70">Fix it with Edit and it goes back to accounting.</div>}
          </div>
        )}
        {r.status === 'paid' && (
          <div className="rounded-xl bg-ok/10 px-4 py-3 text-[14px] text-ok">
            Paid {r.paid_on && formatDate(r.paid_on, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
            {r.paid_reference && <> · reference <span className="font-mono">{r.paid_reference}</span></>}
            {r.paid_by && <> · by {ctx.people.get(r.paid_by) ?? 'someone'}</>}
          </div>
        )}

        <dl className="grid gap-x-6 gap-y-2.5 text-[14px] sm:grid-cols-2">
          <Fact label="For">{r.description}</Fact>
          <Fact label="Category">{r.category}</Fact>
          <Fact label="Team">{r.department_id ? ctx.departments.find((d) => d.id === r.department_id)?.plural ?? r.department_id : null}</Fact>
          <Fact label="Invoice">{[r.invoice_number, r.invoice_date && formatDate(r.invoice_date, { month: 'short', day: 'numeric', year: 'numeric' })].filter(Boolean).join(' · ') || null}</Fact>
          <Fact label="How">{METHODS[r.method]}</Fact>
          <Fact label="Requested">{`${ctx.people.get(r.submitted_by ?? '') ?? 'Someone'}, ${relativeTime(r.created_at)}`}</Fact>
          {r.notes && <div className="sm:col-span-2"><Fact label="Notes"><span className="whitespace-pre-wrap">{r.notes}</span></Fact></div>}
        </dl>

        {(r.method === 'transfer' || r.account_number || r.iban) && (
          <section className="grid gap-1 rounded-xl border border-line p-4">
            <h3 className="mb-1 text-[13px] font-semibold text-white/70">Bank details</h3>
            {!(r.account_number || r.iban) && <p className="text-[13px] text-warn">No bank details on this request.</p>}
            {([['Bank', r.bank_name], ['Account holder', r.account_holder], ['Account number', r.account_number], ['IBAN', r.iban], ['SWIFT', r.swift], ['Reference', r.payment_reference], ['Amount', Number(r.amount).toFixed(2)]] as const)
              .filter(([, v]) => v).map(([label, v]) => (
                <div key={label} className="flex items-center gap-3 text-[14px]">
                  <span className="w-32 shrink-0 text-white/50">{label}</span>
                  <span className={cn('min-w-0 flex-1 break-all', /number|IBAN|SWIFT|Reference|Amount/.test(label) && 'font-mono')}>{v}</span>
                  <IconButton label={`Copy ${label.toLowerCase()}`} className="size-8" onClick={() => copy(String(v))}><Copy className="size-3.5" /></IconButton>
                </div>
              ))}
            {r.save_vendor && !r.vendor_id && ctx.accounting && (
              <Button size="sm" className="mt-2 justify-self-start" onClick={async () => {
                try {
                  const v = await saveVendor({ name: r.payee, category: r.category, currency: r.currency, method: r.method, bank_name: r.bank_name, account_holder: r.account_holder, account_number: r.account_number, iban: r.iban, swift: r.swift });
                  await status({ vendor_id: v.id, save_vendor: false }, `${v.name} saved as a vendor`);
                } catch (e) { toast((e as Error).message, 'bad'); }
              }}>Save {r.payee} as a vendor</Button>
            )}
          </section>
        )}

        <section className="grid gap-2">
          <h3 className="text-[13px] font-semibold text-white/70">Files</h3>
          {!files ? <Spinner /> : (
            <div className="flex flex-wrap gap-2">
              {files.map((f) => {
                const link = links.get(f.path);
                return (
                  <span key={f.id} className="group relative">
                    <a href={link} target="_blank" rel="noreferrer" className="grid h-28 w-24 overflow-hidden rounded-xl border border-line bg-ink-800 text-center">
                      {f.mime.startsWith('image/') && link
                        ? <img src={link} alt={f.name} className="size-full object-cover" />
                        : <span className="grid place-items-center gap-1 p-2 text-[11px] text-white/60"><FileText className="size-7" /><span className="line-clamp-2 break-all">{f.name}</span></span>}
                    </a>
                    {f.kind === 'proof' && <span className="absolute bottom-1 left-1 rounded bg-ok px-1 text-[10px] font-bold text-ink-950">PROOF</span>}
                    {(ctx.accounting || f.uploaded_by === ctx.me) && (
                      <button aria-label={`Remove ${f.name}`} onClick={async () => { if (await confirm('Remove this file?', f.name, 'Remove')) { await removeFile(f); loadFiles(); } }} className="absolute right-1 top-1 hidden size-6 place-items-center rounded-full bg-black/70 group-hover:grid"><X className="size-3.5" /></button>
                    )}
                  </span>
                );
              })}
              {(canEdit || ctx.accounting) && (
                <button onClick={() => input.current?.click()} className="grid h-28 w-24 place-items-center rounded-xl border border-dashed border-white/20 text-[12px] text-white/50 hover:border-gold/50 hover:text-gold">
                  {busy ? <Spinner /> : <span className="grid place-items-center gap-1"><Plus className="size-5" />Add file</span>}
                </button>
              )}
              <input ref={input} type="file" multiple accept="application/pdf,image/*" className="sr-only" onChange={async (e) => {
                const list = Array.from(e.target.files ?? []); e.target.value = '';
                setBusy(true);
                try { for (const f of list) await addFile(r.id, await prepareFile(f)); await loadFiles(); } catch (err) { toast((err as Error).message, 'bad'); } finally { setBusy(false); }
              }} />
            </div>
          )}
        </section>

        <section className="grid gap-3 border-t border-line pt-4">
          <h3 className="text-[13px] font-semibold text-white/70">Messages</h3>
          {comments && comments.length === 0 && <p className="text-[13px] text-mute">Questions between accounting and {mine ? 'you' : 'the requester'} go here.</p>}
          {comments?.map((c) => (
            <div key={c.id} className="rounded-xl bg-white/[0.04] px-3.5 py-2.5">
              <div className="text-[12px] text-white/50"><b className="text-white/80">{ctx.people.get(c.author ?? '') ?? 'Someone'}</b> · {relativeTime(c.created_at)}</div>
              <p className="whitespace-pre-wrap text-[14px]">{c.body}</p>
            </div>
          ))}
          <form className="flex gap-2" onSubmit={async (e) => {
            e.preventDefault();
            if (!text.trim()) return;
            try { const c = await addPaymentComment(r.id, text.trim()); setComments((x) => [...(x ?? []), c]); setText(''); } catch (err) { toast((err as Error).message, 'bad'); }
          }}>
            <Input value={text} onChange={(e) => setText(e.target.value)} placeholder={ctx.accounting ? 'Ask the requester something…' : 'Message accounting…'} maxLength={2000} aria-label="Message" />
            <IconButton label="Send" variant="primary" type="submit" disabled={!text.trim()}><Send className="size-4" /></IconButton>
          </form>
        </section>

        <div className="flex flex-wrap gap-2 border-t border-line pt-4">
          {ctx.accounting && r.status !== 'paid' && <Button variant="primary" icon={<CheckCircle2 className="size-4" />} onClick={onPay}>Mark paid</Button>}
          {ctx.accounting && r.status === 'open' && <Button icon={<PauseCircle className="size-4" />} onClick={() => setNoting('on_hold')}>Put on hold</Button>}
          {ctx.accounting && r.status !== 'rejected' && r.status !== 'paid' && <Button variant="ghost" icon={<Ban className="size-4" />} onClick={() => setNoting('rejected')}>Reject</Button>}
          {ctx.accounting && r.status !== 'open' && <Button variant="ghost" icon={<RotateCcw className="size-4" />} onClick={async () => {
            if (r.status === 'paid' && !(await confirm('Mark as not paid?', 'It goes back to the list of things to pay.', 'Not paid'))) return;
            status({ status: 'open', status_note: null, paid_reference: null }, 'Back on the list');
          }}>{r.status === 'paid' ? 'Not paid after all' : 'Back to pay'}</Button>}
          <span className="ml-auto flex gap-1">
            {ctx.accounting && <IconButton label="Download" onClick={() => downloadZip([r], ctx.people, `${r.payee} ${r.invoice_number ?? r.created_at.slice(0, 10)}`)}><Download className="size-4" /></IconButton>}
            {canEdit && r.status !== 'paid' && <IconButton label="Edit" onClick={onEdit}><Pencil className="size-4" /></IconButton>}
            {(ctx.accounting || (mine && r.status === 'open')) && (
              <IconButton label="Delete request" className="hover:text-bad" onClick={async () => {
                if (!(await confirm('Delete this request?', 'It’s gone with its files and messages. To keep a record, reject it instead.', 'Delete'))) return;
                try { await deleteRequest(r, files ?? []); onDeleted(); } catch (e) { toast((e as Error).message, 'bad'); }
              }}><Trash2 className="size-4" /></IconButton>
            )}
          </span>
        </div>
      </div>

      {noting && (
        <NoteDialog
          title={noting === 'on_hold' ? 'Put on hold' : 'Reject this request'}
          label={noting === 'on_hold' ? 'What’s needed before it can be paid?' : 'Why is it rejected?'}
          action={noting === 'on_hold' ? 'Put on hold' : 'Reject'}
          onClose={() => setNoting(null)}
          onDone={async (note) => { await status({ status: noting, status_note: note }, noting === 'on_hold' ? 'On hold' : 'Rejected'); setNoting(null); }}
        />
      )}
      {dialog}
    </Dialog>
  );
}

const Fact = ({ label, children }: { label: string; children: ReactNode }) => (
  children ? <div className="grid gap-0.5"><dt className="text-[12px] text-white/45">{label}</dt><dd>{children}</dd></div> : null
);

function NoteDialog({ title, label, action, onClose, onDone }: { title: string; label: string; action: string; onClose: () => void; onDone: (note: string) => Promise<void> }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open onClose={onClose} title={title} footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} disabled={!note.trim()} onClick={async () => { setBusy(true); try { await onDone(note.trim()); } finally { setBusy(false); } }}>{action}</Button></>}>
      <Field label={label} hint="The requester sees this.">{(id) => <Textarea id={id} autoFocus rows={3} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />}</Field>
    </Dialog>
  );
}

/** Mark one or more requests paid: date, bank reference and (for one) a proof of payment. */
function PayDialog({ rows, onClose, onDone }: { rows: PaymentRequest[]; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [paidOn, setPaidOn] = useState(arubaToday());
  const [reference, setReference] = useState('');
  const [proof, setProof] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const submit = async () => {
    setBusy(true);
    try {
      for (const r of rows) {
        await updateRequest(r.id, { status: 'paid', paid_on: paidOn, paid_reference: reference.trim() || null, status_note: null });
        if (proof) await addFile(r.id, await prepareFile(proof), 'proof');
      }
      toast(rows.length === 1 ? 'Marked paid' : `${rows.length} marked paid`);
      onDone();
    } catch (e) { toast((e as Error).message, 'bad'); } finally { setBusy(false); }
  };
  return (
    <Dialog
      open
      onClose={onClose}
      title={rows.length === 1 ? `Paid ${rows[0].payee}` : `Mark ${rows.length} as paid`}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} icon={<CheckCircle2 className="size-4" />} onClick={submit}>Mark paid · {totals(rows)}</Button></>}
    >
      <div className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Paid on">{(id) => <Input id={id} type="date" value={paidOn} max={arubaToday()} onChange={(e) => setPaidOn(e.target.value)} />}</Field>
          <Field label="Bank reference (optional)">{(id) => <Input id={id} value={reference} onChange={(e) => setReference(e.target.value)} className="font-mono" />}</Field>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" icon={<Paperclip className="size-4" />} onClick={() => input.current?.click()}>{proof ? 'Change proof' : 'Add proof of payment'}</Button>
          {proof && <span className="text-[13px] text-white/70">{proof.name}</span>}
          <input ref={input} type="file" accept="application/pdf,image/*" className="sr-only" onChange={(e) => { setProof(e.target.files?.[0] ?? null); e.target.value = ''; }} />
        </div>
        {rows.length > 1 && proof && <p className="text-[12.5px] text-mute">The same proof is added to each of the {rows.length} requests.</p>}
      </div>
    </Dialog>
  );
}
