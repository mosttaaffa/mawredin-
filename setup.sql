-- =====================================================
-- حسابات الموردين — ملف إعداد قاعدة البيانات
-- شغّله في Supabase > SQL Editor > New query > Run
-- الملف آمن يتشغل أكتر من مرة (بيضيف الجديد من غير ما يمسح بيانات)
-- =====================================================

-- ---------- الأعضاء (إنت وأخوك) ----------
create table if not exists public.members (
  email      text primary key,
  is_owner   boolean not null default false,
  created_at timestamptz not null default now()
);

create or replace function public.current_email()
returns text language sql stable as $$
  select lower(coalesce(auth.jwt() ->> 'email', ''))
$$;

create or replace function public.is_member()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.members where lower(email) = public.current_email())
$$;

-- أول واحد يسجل دخول يبقى صاحب التطبيق، وبعد كده محدش يدخل إلا لو اتضاف
create or replace function public.join_app()
returns json language plpgsql security definer set search_path = public as $$
declare e text := public.current_email();
begin
  if e = '' then return json_build_object('ok', false); end if;
  if not exists (select 1 from public.members) then
    insert into public.members(email, is_owner) values (e, true);
  end if;
  return json_build_object(
    'ok', exists (select 1 from public.members where lower(email) = e),
    'owner', coalesce((select is_owner from public.members where lower(email) = e), false)
  );
end $$;

-- ---------- الموردين ----------
create table if not exists public.suppliers (
  id         bigint generated always as identity primary key,
  name       text not null unique,
  phone      text,
  notes      text,
  created_by text not null default public.current_email(),
  created_at timestamptz not null default now()
);

-- ---------- الفواتير ----------
create table if not exists public.invoices (
  id          bigint generated always as identity primary key,
  supplier_id bigint not null references public.suppliers(id) on delete restrict,
  inv_date    date not null default current_date,
  inv_no      text,
  amount      numeric(14,2) not null check (amount > 0),
  image_path  text,
  notes       text,
  created_by  text not null default public.current_email(),
  created_at  timestamptz not null default now()
);
create index if not exists invoices_supplier_idx on public.invoices(supplier_id, inv_date);

-- ---------- الدفعات ----------
-- method: cash = كاش | check = شيك | transfer = تحويل | return = مرتجع بضاعة | discount = خصم
-- check_status: pending = لسه | cleared = اتصرف | bounced = ارتد (الشيك المرتد مش بيتحسب)
create table if not exists public.payments (
  id           bigint generated always as identity primary key,
  supplier_id  bigint not null references public.suppliers(id) on delete restrict,
  pay_date     date not null default current_date,
  amount       numeric(14,2) not null check (amount > 0),
  method       text not null check (method in ('cash','check','transfer')),
  check_no     text,
  bank         text,
  due_date     date,
  check_status text check (check_status in ('pending','cleared','bounced')),
  image_path   text,
  notes        text,
  created_by   text not null default public.current_email(),
  created_at   timestamptz not null default now(),
  constraint check_needs_due      check (method <> 'check' or (due_date is not null and check_status is not null))
);
-- تحديثات الإصدار 2
-- الصور ممكن تتمسح بعد التسجيل (التطبيق بيطلبها وقت التسجيل بس)
alter table public.invoices alter column image_path drop not null;
alter table public.payments drop constraint if exists transfer_needs_image;
alter table public.payments add column if not exists invoice_id bigint references public.invoices(id) on delete set null;
alter table public.payments drop constraint if exists payments_method_check;
alter table public.payments add constraint payments_method_check
  check (method in ('cash','check','transfer','return','discount'));
create index if not exists payments_invoice_idx on public.payments(invoice_id);
create index if not exists payments_supplier_idx on public.payments(supplier_id, pay_date);
create index if not exists payments_due_idx on public.payments(due_date) where method = 'check';

-- ---------- رصيد كل مورد ----------
-- المدفوع = كاش + شيكات (غير المرتدة) + تحويلات ، المرتجعات والخصومات لوحدها
drop view if exists public.supplier_balances;
create view public.supplier_balances with (security_invoker = true) as
select s.id, s.name, s.phone, s.notes,
  coalesce(i.total, 0)                                                as total_invoices,
  coalesce(p.paid, 0)                                                 as total_paid,
  coalesce(p.adjust, 0)                                               as total_adjust,
  coalesce(i.total, 0) - coalesce(p.paid, 0) - coalesce(p.adjust, 0)  as balance,
  coalesce(p.pending_checks, 0)                                       as pending_checks,
  greatest(i.last_date, p.last_date)                                  as last_activity
from public.suppliers s
left join (select supplier_id, sum(amount) total, max(inv_date) last_date
           from public.invoices group by supplier_id) i on i.supplier_id = s.id
left join (select supplier_id,
                  sum(amount) filter (where method in ('cash','check','transfer') and coalesce(check_status,'') <> 'bounced') paid,
                  sum(amount) filter (where method in ('return','discount')) adjust,
                  sum(amount) filter (where method = 'check' and check_status = 'pending') pending_checks,
                  max(pay_date) last_date
           from public.payments group by supplier_id) p on p.supplier_id = s.id;

-- ---------- سجل التعديلات ----------
create table if not exists public.activity_log (
  id          bigint generated always as identity primary key,
  at          timestamptz not null default now(),
  actor       text not null default public.current_email(),
  action      text not null,          -- insert | update | delete
  entity      text not null,          -- suppliers | invoices | payments | members
  entity_id   text,
  supplier_id bigint,
  old_row     jsonb,
  new_row     jsonb
);
create index if not exists activity_log_at_idx on public.activity_log(at desc);
create index if not exists invoices_date_idx on public.invoices(inv_date);
create index if not exists payments_date_idx on public.payments(pay_date);
create index if not exists payments_pending_idx on public.payments(due_date) where method = 'check' and check_status = 'pending';

create or replace function public.log_activity()
returns trigger language plpgsql security definer set search_path = public as $$
declare o jsonb; n jsonb; sid bigint; eid text;
begin
  if tg_op <> 'INSERT' then o := to_jsonb(old); end if;
  if tg_op <> 'DELETE' then n := to_jsonb(new); end if;
  if tg_table_name = 'suppliers' then sid := coalesce(n->>'id', o->>'id')::bigint;
  elsif tg_table_name in ('invoices','payments') then sid := coalesce(n->>'supplier_id', o->>'supplier_id')::bigint; end if;
  eid := coalesce(n->>'id', o->>'id', n->>'email', o->>'email');
  if tg_op = 'UPDATE' and o = n then return new; end if;
  insert into public.activity_log(action, entity, entity_id, supplier_id, old_row, new_row)
  values (lower(tg_op), tg_table_name, eid, sid, o, n);
  return coalesce(new, old);
end $$;

do $$
declare t text;
begin
  foreach t in array array['suppliers','invoices','payments','members'] loop
    execute format('drop trigger if exists %1$s_log on public.%1$s', t);
    execute format('create trigger %1$s_log after insert or update or delete on public.%1$s
                    for each row execute function public.log_activity()', t);
  end loop;
end $$;


-- ---------- التقارير (بتتحسب في قاعدة البيانات، سريعة مهما كبرت البيانات) ----------
create or replace function public.report_month(p_month text)
returns json language sql stable as $$
  with r as (select to_date(p_month || '-01', 'YYYY-MM-DD') as d0),
  inv as (select i.supplier_id, i.amount from public.invoices i, r where i.inv_date >= r.d0 and i.inv_date < (r.d0 + interval '1 month')),
  pay as (select p.supplier_id, p.amount, p.method from public.payments p, r
          where p.pay_date >= r.d0 and p.pay_date < (r.d0 + interval '1 month') and coalesce(p.check_status,'') <> 'bounced'),
  chk as (select p.amount from public.payments p, r where p.method = 'check' and p.check_status = 'pending'
          and p.due_date >= r.d0 and p.due_date < (r.d0 + interval '1 month')),
  per as (select supplier_id, sum(b) buy, sum(pd) pay from (
            select supplier_id, amount b, 0 pd from inv union all select supplier_id, 0, amount from pay) x group by supplier_id)
  select json_build_object(
    'buy',      coalesce((select sum(amount) from inv), 0),
    'cash',     coalesce((select sum(amount) from pay where method = 'cash'), 0),
    'check',    coalesce((select sum(amount) from pay where method = 'check'), 0),
    'transfer', coalesce((select sum(amount) from pay where method = 'transfer'), 0),
    'return',   coalesce((select sum(amount) from pay where method = 'return'), 0),
    'discount', coalesce((select sum(amount) from pay where method = 'discount'), 0),
    'due_n',    (select count(*) from chk),
    'due_sum',  coalesce((select sum(amount) from chk), 0),
    'per',      coalesce((select json_agg(json_build_object('id', s.id, 'name', s.name, 'buy', per.buy, 'pay', per.pay) order by per.buy desc, per.pay desc)
                          from per join public.suppliers s on s.id = per.supplier_id), '[]'::json)
  )
$$;

create or replace function public.report_series(p_end text, p_n int default 6)
returns json language sql stable as $$
  with b as (select to_date(p_end || '-01', 'YYYY-MM-DD') e, greatest(1, least(p_n, 36)) n),
  r as (select (e - ((n - 1) || ' month')::interval)::date d0, (e + interval '1 month')::date d1, e, n from b),
  m as (select (r.d0 + (k || ' month')::interval)::date d0 from r, generate_series(0, r.n - 1) k),
  inv as (select date_trunc('month', i.inv_date)::date d0, sum(i.amount) s from public.invoices i, r
          where i.inv_date >= r.d0 and i.inv_date < r.d1 group by 1),
  pay as (select date_trunc('month', p.pay_date)::date d0, sum(p.amount) s from public.payments p, r
          where p.pay_date >= r.d0 and p.pay_date < r.d1 and p.method in ('cash','check','transfer')
            and coalesce(p.check_status,'') <> 'bounced' group by 1)
  select json_agg(json_build_object('m', to_char(m.d0, 'YYYY-MM'), 'buy', coalesce(inv.s, 0), 'pay', coalesce(pay.s, 0)) order by m.d0)
  from m left join inv using (d0) left join pay using (d0)
$$;


-- ملخص الشيكات اللي لسه (للصفحة الرئيسية والتنبيهات) من غير ما نحمّل كل الشيكات
create or replace function public.checks_summary(p_days int default 3)
returns json language sql stable as $$
  with pend as (select p.id, p.amount, p.due_date, p.check_no, p.supplier_id from public.payments p
                where p.method = 'check' and p.check_status = 'pending')
  select json_build_object(
    'n',   (select count(*) from pend),
    'sum', coalesce((select sum(amount) from pend), 0),
    'next', (select json_build_object('due_date', due_date, 'amount', amount, 'name', s.name)
             from pend join public.suppliers s on s.id = pend.supplier_id
             where due_date >= current_date order by due_date, pend.id limit 1),
    'soon', coalesce((select json_agg(json_build_object('id', pend.id, 'amount', amount, 'due_date', due_date, 'check_no', check_no,
                                                        'supplier_id', supplier_id, 'name', s.name) order by due_date, pend.id)
                      from pend join public.suppliers s on s.id = pend.supplier_id
                      where due_date <= current_date + p_days), '[]'::json)
  )
$$;

-- ---------- الصلاحيات (محدش يشوف حاجة إلا الأعضاء) ----------
alter table public.members   enable row level security;
alter table public.suppliers enable row level security;
alter table public.invoices  enable row level security;
alter table public.payments  enable row level security;
alter table public.activity_log enable row level security;
drop policy if exists activity_read on public.activity_log;
create policy activity_read on public.activity_log for select to authenticated using ((select public.is_member()));

drop policy if exists members_read  on public.members;
drop policy if exists members_add   on public.members;
drop policy if exists members_del   on public.members;
-- (select ...) بيخلي التحقق يتحسب مرة واحدة في الاستعلام بدل مرة لكل صف (أسرع بكتير مع البيانات الكبيرة)
create policy members_read on public.members for select to authenticated using ((select public.is_member()));
create policy members_add  on public.members for insert to authenticated
  with check ((select public.is_member()) and is_owner = false);
create policy members_del  on public.members for delete to authenticated
  using ((select public.is_member()) and is_owner = false);

do $$
declare t text;
begin
  foreach t in array array['suppliers','invoices','payments'] loop
    execute format('drop policy if exists %1$s_all on public.%1$s', t);
    execute format('create policy %1$s_all on public.%1$s for all to authenticated
                    using ((select public.is_member())) with check ((select public.is_member()))', t);
  end loop;
end $$;

-- مشاريع Supabase الجديدة مش بتدي صلاحيات تلقائي على الجداول، فبندّيها صراحة
grant usage on schema public to authenticated;
grant select, insert, update, delete on public.suppliers, public.invoices, public.payments to authenticated;
grant select, insert, delete on public.members to authenticated;
grant usage, select on all sequences in schema public to authenticated;
revoke truncate, trigger, references on all tables in schema public from authenticated, anon;
revoke all on all tables in schema public from anon;
revoke all on public.supplier_balances from anon;
grant select on public.supplier_balances to authenticated;
revoke insert, update, delete on public.activity_log from authenticated, anon;
grant select on public.activity_log to authenticated;
revoke execute on function public.join_app() from anon;
revoke execute on function public.report_month(text) from anon;
revoke execute on function public.report_series(text, int) from anon;
revoke execute on function public.checks_summary(int) from anon;
grant execute on function public.report_month(text), public.report_series(text, int), public.checks_summary(int) to authenticated;
-- تقفيل الدوال (تحذيرات أمان Supabase)
alter function public.current_email() set search_path = public;
alter function public.report_month(text) set search_path = public;
alter function public.report_series(text, int) set search_path = public;
alter function public.checks_summary(int) set search_path = public;
revoke execute on function public.is_member() from public, anon;
revoke execute on function public.join_app() from public, anon;
revoke execute on function public.log_activity() from public, anon, authenticated;
revoke execute on function public.report_month(text) from public, anon;
revoke execute on function public.report_series(text, int) from public, anon;
revoke execute on function public.checks_summary(int) from public, anon;
grant execute on function public.is_member(), public.join_app() to authenticated;

-- ---------- تخزين الصور ----------
insert into storage.buckets (id, name, public)
values ('attachments', 'attachments', false)
on conflict (id) do nothing;

drop policy if exists attachments_read   on storage.objects;
drop policy if exists attachments_write  on storage.objects;
drop policy if exists attachments_delete on storage.objects;
create policy attachments_read   on storage.objects for select to authenticated
  using (bucket_id = 'attachments' and (select public.is_member()));
create policy attachments_write  on storage.objects for insert to authenticated
  with check (bucket_id = 'attachments' and (select public.is_member()));
create policy attachments_delete on storage.objects for delete to authenticated
  using (bucket_id = 'attachments' and (select public.is_member()));
