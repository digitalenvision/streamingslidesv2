-- Local development only (`supabase db reset`). Never run against production.
--
-- Test owner: admin@gusto.test / GustoLocal2026 (2FA is set up at the first sign-in).
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new)
values ('00000000-0000-0000-0000-000000000000', 'a841dd7b-f52b-46d0-aa25-eb3d98fff36c', 'authenticated', 'authenticated', 'admin@gusto.test',
        crypt('GustoLocal2026', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"name":"Test Owner"}', now(), now(), '', '', '', '')
on conflict (id) do nothing;
insert into auth.identities (provider_id, user_id, identity_data, provider, created_at, updated_at)
values ('a841dd7b-f52b-46d0-aa25-eb3d98fff36c', 'a841dd7b-f52b-46d0-aa25-eb3d98fff36c', '{"sub":"a841dd7b-f52b-46d0-aa25-eb3d98fff36c","email":"admin@gusto.test"}', 'email', now(), now())
on conflict do nothing;
insert into public.admin_users (user_id, email, role, name) values ('a841dd7b-f52b-46d0-aa25-eb3d98fff36c', 'admin@gusto.test', 'owner', 'Test Owner')
on conflict (user_id) do nothing;

-- Test team manager: glenn@gusto.test / GlennLocal2026, security only, no media, no rules.
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new)
values ('00000000-0000-0000-0000-000000000000', 'd7582867-a0b8-4dba-b4f1-065e904dc19b', 'authenticated', 'authenticated', 'glenn@gusto.test',
        crypt('GlennLocal2026', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"name":"Glenn"}', now(), now(), '', '', '', '')
on conflict (id) do nothing;
insert into auth.identities (provider_id, user_id, identity_data, provider, created_at, updated_at)
values ('d7582867-a0b8-4dba-b4f1-065e904dc19b', 'd7582867-a0b8-4dba-b4f1-065e904dc19b', '{"sub":"d7582867-a0b8-4dba-b4f1-065e904dc19b","email":"glenn@gusto.test"}', 'email', now(), now())
on conflict do nothing;
insert into public.admin_users (user_id, email, role, name, media, rules, teams)
values ('d7582867-a0b8-4dba-b4f1-065e904dc19b', 'glenn@gusto.test', 'manager', 'Glenn', false, false, '{security}')
on conflict (user_id) do nothing;

-- A made-up team.
insert into public.employees (name, department_id, job_title, phone, position) values
  ('Ana Croes', 'bar', 'Head bartender', '+297 560 0001', 0),
  ('Ruben Kock', 'bar', 'Bartender', '+297 560 0002', 1),
  ('Shanaira Werleman', 'bar', 'Bartender', '+297 560 0003', 2),
  ('Jair Maduro', 'bar', 'Bartender', '+297 560 0004', 3),
  ('Melissa Tromp', 'bar', 'Bartender', '+297 560 0005', 4),
  ('Kevin Lacle', 'bar', 'Barback', '+297 560 0006', 5),
  ('Daniela Geerman', 'bar', 'Bartender', '+297 560 0007', 6),
  ('Luis Wever', 'bar', 'Barback', '+297 560 0008', 7),
  ('Gisella Dirksz', 'bar', 'Bartender', '+297 560 0009', 8),
  ('Marco Henriquez', 'security', 'Head of security', '+297 560 0010', 0),
  ('Edwin Arends', 'security', 'Door', '+297 560 0011', 1),
  ('Rigo Thijsen', 'security', 'Floor', '+297 560 0012', 2),
  ('Natasha Ras', 'security', 'Door', '+297 560 0013', 3);

-- Some time off around today.
insert into public.time_off (employee_id, kind, starts_on, ends_on, note, certificate)
select id, 'vacation', current_date + 1, current_date + 4, 'Family trip to Curaçao', false from public.employees where name = 'Melissa Tromp'
union all
select id, 'request', current_date + 4, current_date + 4, 'Graduation', false from public.employees where name = 'Ruben Kock'
union all
select id, 'sick', current_date - 10, current_date - 9, null, false from public.employees where name = 'Jair Maduro';
