// Accounting: the vendors Gusto pays, with their bank details, so a payment request only
// needs "pay Balashi" and the rest is filled in. Shows what's still open and what was paid
// this year per vendor.
import { useMemo, useState, type FormEvent } from 'react';
import { Building2, Copy, Pencil, Plus } from 'lucide-react';
import { PageHeader } from '@/components/AppShell';
import { Badge, Button, Dialog, Empty, Field, IconButton, Input, Segmented, Spinner, Switch, Textarea, useToast } from '@/components/ui';
import { cn } from '@/lib/format';
import { CATEGORIES, CURRENCIES, METHODS, listRequests, listVendors, saveVendor, totals } from '@/lib/payments';
import { useLoad } from '@/lib/useLoad';
import type { Currency, PayMethod, Vendor } from '@/types';

export function Vendors() {
  const toast = useToast();
  const { data, reload } = useLoad(async () => {
    const [vendors, requests] = await Promise.all([listVendors(), listRequests()]);
    return { vendors, requests };
  });
  const [query, setQuery] = useState('');
  const [inactive, setInactive] = useState(false);
  const [editing, setEditing] = useState<Partial<Vendor> | null>(null);
  const year = new Date().getFullYear().toString();

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data?.vendors ?? []).filter((v) => (inactive || v.active) && (!q || `${v.name} ${v.category ?? ''} ${v.account_number ?? ''} ${v.iban ?? ''}`.toLowerCase().includes(q)));
  }, [data, query, inactive]);

  return (
    <>
      <PageHeader
        kicker="Accounting"
        title="Vendors"
        subtitle="Who Gusto pays, with their bank details. Pick one in a payment request and the details are filled in for you."
        actions={<Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setEditing({ currency: 'AWG', method: 'transfer', active: true })}>Add vendor</Button>}
      />
      <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-center">
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, category, account…" className="h-10 sm:w-80" aria-label="Search vendors" />
        <div className="sm:ml-auto"><Switch checked={inactive} onChange={setInactive} label="Show inactive" /></div>
      </div>
      {!data ? <div className="grid h-48 place-items-center"><Spinner /></div>
        : shown.length === 0 ? <Empty icon={<Building2 />} title="No vendors yet" body="Add the companies and people you pay regularly, with their bank details." />
        : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {shown.map((v) => {
              const mine = data.requests.filter((r) => r.vendor_id === v.id);
              const open = mine.filter((r) => r.status === 'open' || r.status === 'on_hold');
              const paid = mine.filter((r) => r.status === 'paid' && (r.paid_on ?? '').startsWith(year));
              return (
                <article key={v.id} className={cn('panel grid content-start gap-3 p-4', !v.active && 'opacity-55')}>
                  <div className="flex items-start gap-2">
                    <div className="grid min-w-0 flex-1 leading-tight">
                      <span className="truncate text-[15px] font-semibold">{v.name}</span>
                      <span className="truncate text-[12.5px] text-mute">{[v.category, METHODS[v.method], v.currency].filter(Boolean).join(' · ')}</span>
                    </div>
                    {!v.active && <Badge>Inactive</Badge>}
                    <IconButton label={`Edit ${v.name}`} className="size-9" onClick={() => setEditing(v)}><Pencil className="size-4" /></IconButton>
                  </div>
                  {(v.account_number || v.iban) ? (
                    <div className="grid gap-0.5 rounded-lg bg-white/[0.03] px-3 py-2 text-[12.5px]">
                      {v.bank_name && <span className="text-white/60">{v.bank_name}{v.account_holder ? ` · ${v.account_holder}` : ''}</span>}
                      {[v.account_number, v.iban].filter(Boolean).map((n) => (
                        <button key={n} onClick={() => navigator.clipboard.writeText(n!).then(() => toast('Copied'))} className="flex items-center gap-1.5 text-left font-mono hover:text-gold"><Copy className="size-3 shrink-0" />{n}</button>
                      ))}
                    </div>
                  ) : <span className="text-[12.5px] text-warn">No bank details</span>}
                  <div className="flex justify-between text-[12.5px] text-white/55">
                    <span>{open.length ? <>Open: <b className="text-white">{totals(open)}</b></> : 'Nothing open'}</span>
                    <span>Paid {year}: {paid.length ? totals(paid) : '—'}</span>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      {editing && <VendorDialog initial={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />}
    </>
  );
}

function VendorDialog({ initial, onClose, onSaved }: { initial: Partial<Vendor>; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [v, setV] = useState<Partial<Vendor>>(initial);
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<Vendor>) => setV((x) => ({ ...x, ...patch }));
  const text = (k: keyof Vendor, label: string, mono = false, placeholder?: string) => (
    <Field label={label}>{(id) => <Input id={id} value={(v[k] as string) ?? ''} placeholder={placeholder} className={cn(mono && 'font-mono')} onChange={(e) => set({ [k]: e.target.value } as Partial<Vendor>)} />}</Field>
  );
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!v.name?.trim()) return;
    setBusy(true);
    try {
      const clean = Object.fromEntries(Object.entries(v).map(([k, x]) => [k, typeof x === 'string' ? x.trim() || null : x])) as Partial<Vendor>;
      await saveVendor({ ...clean, name: v.name.trim() });
      toast(v.id ? 'Vendor saved' : `${v.name.trim()} added`);
      onSaved();
    } catch (err) { toast((err as Error).message, 'bad'); } finally { setBusy(false); }
  };
  return (
    <Dialog open onClose={onClose} wide title={v.id ? v.name ?? 'Vendor' : 'Add vendor'} footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" type="submit" form="vendor" loading={busy}>Save</Button></>}>
      <form id="vendor" onSubmit={submit} className="grid gap-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name">{(id) => <Input id={id} required autoFocus maxLength={120} value={v.name ?? ''} onChange={(e) => set({ name: e.target.value })} />}</Field>
          <Field label="Category">{(id) => (
            <select id={id} className="field" value={v.category ?? ''} onChange={(e) => set({ category: e.target.value || null })}>
              <option value="">—</option>
              {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          )}</Field>
          {text('contact_name', 'Contact person')}
          {text('phone', 'Phone')}
          {text('email', 'Email')}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <span className="text-[13px] font-medium text-white/85">Usual currency</span>
            <Segmented<Currency> value={(v.currency ?? 'AWG') as Currency} onChange={(currency) => set({ currency })} options={CURRENCIES.map((c) => ({ value: c, label: c }))} />
          </div>
          <Field label="Usually paid by">{(id) => (
            <select id={id} className="field" value={v.method ?? 'transfer'} onChange={(e) => set({ method: e.target.value as PayMethod })}>
              {(Object.keys(METHODS) as PayMethod[]).map((m) => <option key={m} value={m}>{METHODS[m]}</option>)}
            </select>
          )}</Field>
        </div>
        <div className="grid gap-4 rounded-xl border border-line p-4 sm:grid-cols-2">
          <span className="text-[13px] font-semibold sm:col-span-2">Bank details</span>
          {text('bank_name', 'Bank', false, 'Aruba Bank, CMB, RBC…')}
          {text('account_holder', 'Account holder')}
          {text('account_number', 'Account number', true)}
          {text('iban', 'IBAN', true)}
          {text('swift', 'SWIFT / BIC', true)}
          {text('bank_address', 'Bank address (foreign transfers)')}
        </div>
        <Field label="Notes">{(id) => <Textarea id={id} rows={3} maxLength={2000} value={v.notes ?? ''} onChange={(e) => set({ notes: e.target.value })} placeholder="Payment terms, who to call, customer number…" />}</Field>
        {v.id && <Switch checked={v.active ?? true} onChange={(active) => set({ active })} label="Active" description="Inactive vendors can’t be picked for new requests; their history stays" />}
      </form>
    </Dialog>
  );
}
