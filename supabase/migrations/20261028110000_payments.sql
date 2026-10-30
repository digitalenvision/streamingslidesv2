-- Payments: anyone with an account asks accounting to pay something (an invoice, a
-- screenshot of a bill, a cash expense), accounting sees what's due today and marks it paid.
--
--   vendors            saved payees with their bank details (accounting manages them)
--   payment_requests   one thing to pay; bank details are copied onto it, so changing a
--                      vendor later never changes what was asked or paid
--   payment_files      invoices, screenshots and proof of payment (private bucket "accounting")
--   payment_comments   questions back and forth ("IBAN missing?")
--
-- Who sees what: accounting (owners, and accounts with accounting on) sees and handles
-- everything; everyone else submits requests and sees only their own. Vendor names (not
-- bank details) are listed for everyone so they can pick one.

alter table public.admin_users add column accounting boolean not null default false;

create or replace function public.my_access()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('role', role, 'media', role = 'owner' or media, 'rules', role = 'owner' or rules,
                            'accounting', role = 'owner' or accounting,
                            'teams', case when role = 'owner' then null else teams end)
    from public.admin_users where user_id = (select auth.uid());
$$;

create or replace function public.can_accounting()
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_mfa_session() and exists (
    select 1 from public.admin_users where user_id = (select auth.uid()) and (role = 'owner' or accounting));
$$;

-- ---------------------------------------------------------------------------
-- Vendors
-- ---------------------------------------------------------------------------
create table public.vendors (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 120),
  category text,
  contact_name text,
  email text,
  phone text,
  bank_name text,
  account_holder text,
  account_number text,
  iban text,
  swift text,
  bank_address text,
  currency text not null default 'AWG' check (currency in ('AWG', 'USD', 'EUR')),
  method text not null default 'transfer' check (method in ('transfer', 'cash', 'card', 'check', 'online')),
  notes text check (length(notes) <= 2000),
  active boolean not null default true,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index vendors_name_idx on public.vendors (lower(name));
create trigger vendors_touch before update on public.vendors
  for each row execute function public.touch_updated_at();

alter table public.vendors enable row level security;
create policy "Accounting manages vendors" on public.vendors for all to authenticated
  using (public.can_accounting()) with check (public.can_accounting());

-- What everyone may see of the vendors: enough to pick one, no bank details.
create or replace function public.vendor_choices()
returns table (id uuid, name text, category text, currency text, method text, has_bank boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select v.id, v.name, v.category, v.currency, v.method,
         coalesce(v.account_number, v.iban) is not null
    from public.vendors v
   where v.active and public.is_admin()
   order by lower(v.name);
$$;
revoke all on function public.vendor_choices() from public, anon;
grant execute on function public.vendor_choices() to authenticated;

-- ---------------------------------------------------------------------------
-- Payment requests
-- ---------------------------------------------------------------------------
create table public.payment_requests (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid references public.vendors (id) on delete set null,
  payee text not null check (length(payee) between 1 and 120),
  amount numeric(12, 2) not null check (amount > 0),
  currency text not null default 'AWG' check (currency in ('AWG', 'USD', 'EUR')),
  description text not null check (length(description) between 1 and 500),
  category text,
  department_id text references public.departments (id) on delete set null,
  invoice_number text,
  invoice_date date,
  due_date date,
  -- Has to be paid today, whatever the due date says.
  urgent boolean not null default false,
  method text not null default 'transfer' check (method in ('transfer', 'cash', 'card', 'check', 'online')),
  bank_name text,
  account_holder text,
  account_number text,
  iban text,
  swift text,
  -- What to put in the transfer description (invoice number, customer number…).
  payment_reference text,
  notes text check (length(notes) <= 2000),
  -- A new payee the requester would like saved as a vendor.
  save_vendor boolean not null default false,
  status text not null default 'open' check (status in ('open', 'on_hold', 'paid', 'rejected')),
  status_note text check (length(status_note) <= 500),
  paid_on date,
  paid_reference text,
  paid_at timestamptz,
  paid_by uuid references auth.users (id) on delete set null,
  -- What the invoice reader found, kept for reference.
  extracted jsonb,
  submitted_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index payment_requests_status_idx on public.payment_requests (status, due_date);
create index payment_requests_vendor_idx on public.payment_requests (vendor_id, created_at desc);
create trigger payment_requests_touch before update on public.payment_requests
  for each row execute function public.touch_updated_at();

create or replace function public.payment_requests_stamp()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.status = 'paid' and (tg_op = 'INSERT' or old.status <> 'paid') then
    new.paid_at = now();
    new.paid_by = auth.uid();
    new.paid_on = coalesce(new.paid_on, (now() at time zone 'America/Aruba')::date);
  elsif new.status <> 'paid' then
    new.paid_at = null;
    new.paid_by = null;
    new.paid_on = null;
  end if;
  return new;
end;
$$;
create trigger payment_requests_stamp before insert or update of status on public.payment_requests
  for each row execute function public.payment_requests_stamp();

create or replace function public.can_see_payment(p_request uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.can_accounting() or (public.is_admin() and exists (
    select 1 from public.payment_requests r where r.id = p_request and r.submitted_by = (select auth.uid())));
$$;

alter table public.payment_requests enable row level security;
create policy "Accounting and the requester see a request" on public.payment_requests for select to authenticated
  using (public.can_accounting() or (public.is_admin() and submitted_by = (select auth.uid())));
create policy "Anyone with an account asks for a payment" on public.payment_requests for insert to authenticated
  with check (public.is_admin() and submitted_by = (select auth.uid()) and (status = 'open' or public.can_accounting()));
-- Requesters can fix their own request until it's handled; only accounting pays, holds or rejects.
create policy "Accounting handles, requesters fix their own" on public.payment_requests for update to authenticated
  using (public.can_accounting() or (public.is_admin() and submitted_by = (select auth.uid()) and status in ('open', 'on_hold')))
  with check (public.can_accounting() or (submitted_by = (select auth.uid()) and status = 'open'));
create policy "Accounting or the requester (while open) deletes" on public.payment_requests for delete to authenticated
  using (public.can_accounting() or (public.is_admin() and submitted_by = (select auth.uid()) and status = 'open'));

-- Possible duplicates of a new request (same vendor/payee and invoice number, or same
-- amount in the last 60 days), across everyone's requests, without showing their details.
create or replace function public.payment_duplicates(p_payee text, p_invoice text, p_amount numeric, p_currency text)
returns table (id uuid, created_at timestamptz, status text, amount numeric, currency text, invoice_number text, mine boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, r.created_at, r.status, r.amount, r.currency, r.invoice_number, r.submitted_by = (select auth.uid())
    from public.payment_requests r
   where public.is_admin()
     and r.status <> 'rejected'
     and lower(r.payee) = lower(p_payee)
     and ((nullif(p_invoice, '') is not null and lower(r.invoice_number) = lower(p_invoice))
          or (r.amount = p_amount and r.currency = p_currency and r.created_at > now() - interval '60 days'))
   order by r.created_at desc
   limit 5;
$$;
revoke all on function public.payment_duplicates(text, text, numeric, text) from public, anon;
grant execute on function public.payment_duplicates(text, text, numeric, text) to authenticated;

create table public.payment_files (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.payment_requests (id) on delete cascade,
  path text not null unique,
  name text not null,
  mime text not null,
  size integer not null,
  kind text not null default 'invoice' check (kind in ('invoice', 'proof', 'other')),
  uploaded_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index payment_files_request_idx on public.payment_files (request_id);
alter table public.payment_files enable row level security;
create policy "See files of requests you can see" on public.payment_files for select to authenticated
  using (public.can_see_payment(request_id));
create policy "Add files to requests you can see" on public.payment_files for insert to authenticated
  with check (public.can_see_payment(request_id) and (kind <> 'proof' or public.can_accounting()));
create policy "Accounting or the uploader removes files" on public.payment_files for delete to authenticated
  using (public.can_accounting() or (uploaded_by = (select auth.uid()) and public.can_see_payment(request_id)));

create table public.payment_comments (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.payment_requests (id) on delete cascade,
  author uuid default auth.uid() references auth.users (id) on delete set null,
  body text not null check (length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index payment_comments_request_idx on public.payment_comments (request_id, created_at);
alter table public.payment_comments enable row level security;
create policy "See comments on requests you can see" on public.payment_comments for select to authenticated
  using (public.can_see_payment(request_id));
create policy "Comment on requests you can see" on public.payment_comments for insert to authenticated
  with check (author = (select auth.uid()) and public.can_see_payment(request_id));
create policy "Delete your own comments" on public.payment_comments for delete to authenticated
  using (author = (select auth.uid()));

-- Files: accounting/<request id>/<file>.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('accounting', 'accounting', false, 20971520,
        array['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/gif'])
on conflict (id) do nothing;

create policy "Accounting files: read" on storage.objects for select to authenticated
  using (bucket_id = 'accounting' and public.can_see_payment(((storage.foldername(name))[1])::uuid));
create policy "Accounting files: upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'accounting' and public.can_see_payment(((storage.foldername(name))[1])::uuid));
create policy "Accounting files: remove" on storage.objects for delete to authenticated
  using (bucket_id = 'accounting' and public.can_see_payment(((storage.foldername(name))[1])::uuid));

revoke all on public.vendors, public.payment_requests, public.payment_files, public.payment_comments from anon;

create trigger vendors_audit after insert or update or delete on public.vendors
  for each row execute function public.audit();
create trigger payment_requests_audit after insert or update or delete on public.payment_requests
  for each row execute function public.audit();
create trigger payment_files_audit after insert or delete on public.payment_files
  for each row execute function public.audit();
create trigger payment_comments_audit after insert or delete on public.payment_comments
  for each row execute function public.audit();

-- Picking a saved vendor copies its bank details onto the request (requesters can't read
-- vendor bank details themselves), unless the request brings its own.
create or replace function public.payment_requests_vendor_bank()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.vendors;
begin
  if new.vendor_id is not null and (tg_op = 'INSERT' or new.vendor_id is distinct from old.vendor_id) then
    select * into v from public.vendors where id = new.vendor_id;
    if found and coalesce(new.account_number, new.iban) is null then
      new.bank_name = v.bank_name;
      new.account_holder = v.account_holder;
      new.account_number = v.account_number;
      new.iban = v.iban;
      new.swift = v.swift;
    end if;
  end if;
  return new;
end;
$$;
create trigger payment_requests_vendor_bank before insert or update of vendor_id on public.payment_requests
  for each row execute function public.payment_requests_vendor_bank();
