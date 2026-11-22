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

-- =====================================================
-- حسابات الموظفين (الإصدار 3)
-- =====================================================
create table if not exists public.employees (
  id          bigint generated always as identity primary key,
  emp_no      text,
  name        text not null unique,
  branch      text,                      -- زهرة / ورد / زهرة وورد
  base_salary numeric(14,2),
  phone       text,
  notes       text,
  active      boolean not null default true,
  created_by  text not null default public.current_email(),
  created_at  timestamptz not null default now()
);

-- دفعات الاستيراد (كل كشف بيتستورد = دفعة)
create table if not exists public.emp_import_batches (
  id              uuid primary key default gen_random_uuid(),
  branch          text,
  period_from     date not null,
  period_to       date not null,
  source_image    text,
  employee_count  int not null default 0,
  totals_original jsonb,                 -- الإجماليات المكتوبة في الكشف
  totals_computed jsonb,                 -- الإجماليات المحسوبة من الأرقام
  notes           text,
  created_by      text not null default public.current_email(),
  created_at      timestamptz not null default now()
);

-- التسويات التاريخية (سطر لكل موظف في كل فترة) — مش حركات جديدة على الخزينة
create table if not exists public.emp_settlements (
  id             bigint generated always as identity primary key,
  employee_id    bigint not null references public.employees(id) on delete restrict,
  batch_id       uuid references public.emp_import_batches(id) on delete restrict,
  branch         text,
  period_from    date not null,
  period_to      date not null,
  base_salary    numeric(14,2),
  work_days      numeric(6,2),
  earned_salary  numeric(14,2),
  comm_zahra     numeric(14,2),
  comm_ward      numeric(14,2),
  comm_total     numeric(14,2),
  adv_zahra      numeric(14,2),
  adv_ward       numeric(14,2),
  ded_general    numeric(14,2),
  ded_clothes    numeric(14,2),
  adv_ded_total  numeric(14,2),
  late_ded       numeric(14,2),
  prev_balance   numeric(14,2),
  net_balance    numeric(14,2),         -- الصافي (موجب = للموظف ، سالب = عليه)
  original       jsonb,                  -- الأرقام زي ما اتقرت من الكشف بالظبط
  uncertain      text[],                 -- الخانات اللي كانت مش واضحة
  source_image   text,
  is_historical  boolean not null default true,
  notes          text,
  created_by     text not null default public.current_email(),
  created_at     timestamptz not null default now(),
  unique (employee_id, period_from, period_to)
);
create index if not exists emp_settlements_emp_idx on public.emp_settlements(employee_id, period_to desc);
create index if not exists emp_settlements_batch_idx on public.emp_settlements(batch_id);

-- حركات الموظف بعد آخر تسوية
-- salary/commission = للموظف (+) ، advance/deduction/payment = عليه (−) ، adjustment = بالإشارة
create table if not exists public.emp_transactions (
  id          bigint generated always as identity primary key,
  employee_id bigint not null references public.employees(id) on delete restrict,
  tx_date     date not null default current_date,
  kind        text not null check (kind in ('salary','commission','advance','deduction','payment','adjustment')),
  amount      numeric(14,2) not null check (kind = 'adjustment' or amount > 0),
  branch      text,
  notes       text,
  image_path  text,
  created_by  text not null default public.current_email(),
  created_at  timestamptz not null default now()
);
create index if not exists emp_tx_emp_idx on public.emp_transactions(employee_id, tx_date);

-- رصيد كل موظف = صافي آخر تسوية + الحركات اللي بعدها
drop view if exists public.employee_balances;
create view public.employee_balances with (security_invoker = true) as
select e.id, e.emp_no, e.name, e.branch, e.base_salary, e.phone, e.notes, e.active,
       ls.period_from as last_from, ls.period_to as last_to, ls.net_balance as last_net,
       coalesce(t.delta, 0) as tx_delta,
       coalesce(ls.net_balance, 0) + coalesce(t.delta, 0) as balance
from public.employees e
left join lateral (select s.period_from, s.period_to, s.net_balance from public.emp_settlements s
                   where s.employee_id = e.id order by s.period_to desc, s.id desc limit 1) ls on true
left join lateral (select sum(case when x.kind in ('salary','commission') then x.amount
                                   when x.kind = 'adjustment' then x.amount else -x.amount end) delta
                   from public.emp_transactions x
                   where x.employee_id = e.id and (ls.period_to is null or x.tx_date > ls.period_to)) t on true;

-- استيراد كشف كامل في معاملة واحدة: يا كله يتحفظ يا ولا حاجة
create or replace function public.import_employee_settlements(p jsonb)
returns json language plpgsql set search_path = public as $$
declare
  r jsonb; v_emp bigint; v_batch uuid; v_from date; v_to date; v_new int := 0; v_n int := 0;
  v_existing text[]; v_dup text[];
  num constant text[] := array['base_salary','work_days','earned_salary','comm_zahra','comm_ward','comm_total','adv_zahra','adv_ward',
                               'ded_general','ded_clothes','adv_ded_total','late_ded','prev_balance','net_balance'];
begin
  if not public.is_member() then raise exception 'not allowed'; end if;
  v_from := (p->>'period_from')::date; v_to := (p->>'period_to')::date;
  if v_from is null or v_to is null or v_to < v_from then raise exception 'فترة الكشف غلط'; end if;
  if jsonb_array_length(coalesce(p->'rows','[]')) = 0 then raise exception 'مفيش موظفين في الكشف'; end if;

  -- موظفين موجودين بالفعل؟ لازم تأكيد قبل الدمج
  select array_agg(distinct e.name) into v_existing
  from jsonb_array_elements(p->'rows') x join public.employees e on e.name = trim(x->>'name');
  if v_existing is not null and not coalesce((p->>'merge')::boolean, false) then
    return json_build_object('ok', false, 'need_confirm', true, 'existing', v_existing);
  end if;

  -- نفس الفترة اتستوردت قبل كده لنفس الموظف؟ نوقف كل حاجة
  select array_agg(distinct e.name) into v_dup
  from jsonb_array_elements(p->'rows') x join public.employees e on e.name = trim(x->>'name')
  join public.emp_settlements s on s.employee_id = e.id and s.period_from = v_from and s.period_to = v_to;
  if v_dup is not null then
    return json_build_object('ok', false, 'duplicate', true, 'existing', v_dup);
  end if;

  insert into public.emp_import_batches(branch, period_from, period_to, source_image, employee_count, totals_original, totals_computed, notes)
  values (p->>'branch', v_from, v_to, p->>'source_image', jsonb_array_length(p->'rows'), p->'totals_original', p->'totals_computed', p->>'notes')
  returning id into v_batch;

  for r in select * from jsonb_array_elements(p->'rows') loop
    v_emp := null;
    select id into v_emp from public.employees where name = trim(r->>'name');
    if v_emp is null then
      insert into public.employees(emp_no, name, branch, base_salary)
      values (nullif(r->>'emp_no',''), trim(r->>'name'), p->>'branch', nullif(r->>'base_salary','')::numeric)
      returning id into v_emp;
      v_new := v_new + 1;
    end if;
    insert into public.emp_settlements(employee_id, batch_id, branch, period_from, period_to,
      base_salary, work_days, earned_salary, comm_zahra, comm_ward, comm_total, adv_zahra, adv_ward,
      ded_general, ded_clothes, adv_ded_total, late_ded, prev_balance, net_balance, original, uncertain, source_image)
    values (v_emp, v_batch, p->>'branch', v_from, v_to,
      nullif(r->>'base_salary','')::numeric, nullif(r->>'work_days','')::numeric, nullif(r->>'earned_salary','')::numeric,
      nullif(r->>'comm_zahra','')::numeric, nullif(r->>'comm_ward','')::numeric, nullif(r->>'comm_total','')::numeric,
      nullif(r->>'adv_zahra','')::numeric, nullif(r->>'adv_ward','')::numeric, nullif(r->>'ded_general','')::numeric,
      nullif(r->>'ded_clothes','')::numeric, nullif(r->>'adv_ded_total','')::numeric, nullif(r->>'late_ded','')::numeric,
      nullif(r->>'prev_balance','')::numeric, nullif(r->>'net_balance','')::numeric,
      r->'original', array(select jsonb_array_elements_text(coalesce(r->'uncertain','[]'))), p->>'source_image');
    v_n := v_n + 1;
  end loop;
  return json_build_object('ok', true, 'batch_id', v_batch, 'employees_created', v_new, 'settlements', v_n);
end $$;

alter table public.employees          enable row level security;
alter table public.emp_import_batches enable row level security;
alter table public.emp_settlements    enable row level security;
alter table public.emp_transactions   enable row level security;
do $$
declare t text;
begin
  foreach t in array array['employees','emp_import_batches','emp_settlements','emp_transactions'] loop
    execute format('drop policy if exists %1$s_all on public.%1$s', t);
    execute format('create policy %1$s_all on public.%1$s for all to authenticated
                    using ((select public.is_member())) with check ((select public.is_member()))', t);
    execute format('drop trigger if exists %1$s_log on public.%1$s', t);
    execute format('create trigger %1$s_log after insert or update or delete on public.%1$s
                    for each row execute function public.log_activity()', t);
  end loop;
end $$;
grant select, insert, update, delete on public.employees, public.emp_settlements, public.emp_transactions, public.emp_import_batches to authenticated;
grant select on public.employee_balances to authenticated;
grant usage, select on all sequences in schema public to authenticated;
revoke all on public.employee_balances from anon;
revoke all on public.employees, public.emp_settlements, public.emp_transactions, public.emp_import_batches from anon;
revoke execute on function public.import_employee_settlements(jsonb) from public, anon;
grant execute on function public.import_employee_settlements(jsonb) to authenticated;

-- =====================================================
-- المزامنة من غير نت (الإصدار 4)
-- كل عملية من الموبايل ليها رقم مميز (op_id). السيرفر بينفّذها مرة واحدة بس:
-- لو نفس العملية اتبعتت تاني (النت قطع وهي بتتبعت) بيرجّع نفس النتيجة من غير ما يكررها.
-- التعديل والمسح بيتأكدوا إن محدش غيّر نفس الخانات من جهاز تاني في الوقت ده، ولو حصل بيتسجل «تعارض» ومش بيتكتب فوقه.
-- =====================================================
create table if not exists public.sync_ops (
  op_id    uuid primary key,
  actor    text not null default public.current_email(),
  at       timestamptz not null default now(),
  tbl      text not null,
  kind     text not null,
  row_key  text,
  status   text not null,
  result   jsonb
);
create table if not exists public.sync_conflicts (
  id          bigint generated always as identity primary key,
  op_id       uuid not null,
  at          timestamptz not null default now(),
  actor       text not null default public.current_email(),
  tbl         text not null,
  kind        text not null,
  row_key     text,
  base        jsonb,      -- الرقم اللي الجهاز كان شايفه وقت التعديل
  mine        jsonb,      -- التعديل اللي اتعمل على الجهاز
  server      jsonb,      -- اللي على السيرفر دلوقتي
  resolved_at timestamptz,
  resolved_by text,
  resolution  text        -- mine | server
);

create or replace function public.sync_apply(p jsonb)
returns jsonb language plpgsql set search_path = public as $$
declare
  v_op uuid := (p->>'op_id')::uuid;
  t text := p->>'table';
  k text := p->>'kind';
  keycol text;
  v_key text := p->>'key';
  ex jsonb; cur jsonb; r jsonb; res jsonb; cols text; c text; bad boolean := false;
begin
  if not public.is_member() then raise exception 'not allowed'; end if;
  if v_op is null then raise exception 'op_id required'; end if;
  if t not in ('suppliers','invoices','payments','members','employees','emp_settlements','emp_transactions','check_payments','loans','loan_payments','daily_sales','expenses','bank_moves') then raise exception 'table not allowed: %', t; end if;
  if t = 'check_payments' and k = 'delete' then raise exception 'دفعة سداد الشيك مبتتمسحش — اعملها إلغاء'; end if;
  if k not in ('insert','update','delete') then raise exception 'kind not allowed: %', k; end if;

  -- نفس العملية اتنفذت قبل كده؟ رجّع نفس النتيجة
  select result into ex from public.sync_ops where op_id = v_op;
  if found then return ex || jsonb_build_object('replayed', true); end if;
  -- لو جهازين بعتوا نفس العملية في نفس اللحظة: التاني يستنى الأول
  perform pg_advisory_xact_lock(hashtext(v_op::text));
  select result into ex from public.sync_ops where op_id = v_op;
  if found then return ex || jsonb_build_object('replayed', true); end if;

  keycol := case when t = 'members' then 'email' else 'id' end;
  begin
    if k = 'insert' then
      r := p->'row';
      select string_agg(quote_ident(col.column_name), ',' order by col.ordinal_position) into cols
      from information_schema.columns col
      where col.table_schema = 'public' and col.table_name = t
        and col.is_identity = 'NO' and col.is_generated = 'NEVER'
        and col.column_name not in ('created_at','created_by')
        and r ? col.column_name;
      if cols is null then raise exception 'empty row'; end if;
      execute format('insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I, $1) returning to_jsonb(%I.*)', t, cols, cols, t, t)
        using r into cur;
      res := jsonb_build_object('status', 'ok', 'row', cur);

    elsif k = 'update' then
      execute format('select to_jsonb(x) from public.%I x where x.%I::text = $1 for update', t, keycol) using v_key into cur;
      if cur is null then
        res := jsonb_build_object('status', 'conflict', 'reason', 'deleted', 'server', null);
      else
        for c in select jsonb_object_keys(p->'changes') loop
          if not (cur ? c) then raise exception 'unknown column: %', c; end if;
          if (cur->c) is distinct from (p->'base'->c) and (cur->c) is distinct from (p->'changes'->c) then bad := true; end if;
        end loop;
        if bad then
          res := jsonb_build_object('status', 'conflict', 'reason', 'changed', 'server', cur);
        else
          select string_agg(quote_ident(x), ',') into cols from jsonb_object_keys(p->'changes') x
          where x not in ('id','created_at','created_by');
          if cols is null then
            res := jsonb_build_object('status', 'ok', 'row', cur);
          else
            execute format('update public.%I x set (%s) = (select %s from jsonb_populate_record(null::public.%I, $1)) where x.%I::text = $2 returning to_jsonb(x.*)',
                           t, cols, cols, t, keycol) using p->'changes', v_key into cur;
            res := jsonb_build_object('status', 'ok', 'row', cur);
          end if;
        end if;
      end if;

    else -- delete
      execute format('select to_jsonb(x) from public.%I x where x.%I::text = $1 for update', t, keycol) using v_key into cur;
      if cur is null then
        res := jsonb_build_object('status', 'ok', 'row', null, 'already', true);
      else
        if p->'base' is not null and jsonb_typeof(p->'base') = 'object' then
          for c in select jsonb_object_keys(p->'base') loop
            if c not in ('created_at','created_by') and (cur ? c) and (cur->c) is distinct from (p->'base'->c) then bad := true; end if;
          end loop;
        end if;
        if bad then
          res := jsonb_build_object('status', 'conflict', 'reason', 'changed', 'server', cur);
        else
          execute format('delete from public.%I x where x.%I::text = $1', t, keycol) using v_key;
          res := jsonb_build_object('status', 'ok', 'row', null);
        end if;
      end if;
    end if;
  exception when others then
    res := jsonb_build_object('status', 'error', 'message', sqlerrm, 'code', sqlstate);
  end;

  if res->>'status' = 'conflict' then
    insert into public.sync_conflicts(op_id, tbl, kind, row_key, base, mine, server)
    values (v_op, t, k, v_key, p->'base', coalesce(p->'changes', p->'row'), res->'server');
  end if;
  insert into public.sync_ops(op_id, tbl, kind, row_key, status, result)
  values (v_op, t, k, coalesce(v_key, res->'row'->>keycol), res->>'status', res);
  return res;
end $$;

create or replace function public.resolve_conflict(p_op uuid, p_resolution text)
returns void language sql set search_path = public as $$
  update public.sync_conflicts set resolved_at = now(), resolved_by = public.current_email(), resolution = p_resolution
  where op_id = p_op and resolved_at is null and (select public.is_member()) and p_resolution in ('mine','server');
$$;

alter table public.sync_ops       enable row level security;
alter table public.sync_conflicts enable row level security;
drop policy if exists sync_ops_all on public.sync_ops;
create policy sync_ops_all on public.sync_ops for all to authenticated
  using ((select public.is_member())) with check ((select public.is_member()));
drop policy if exists sync_conflicts_all on public.sync_conflicts;
create policy sync_conflicts_all on public.sync_conflicts for all to authenticated
  using ((select public.is_member())) with check ((select public.is_member()));
grant select, insert on public.sync_ops to authenticated;
grant select, insert, update on public.sync_conflicts to authenticated;
revoke all on public.sync_ops, public.sync_conflicts from anon;
revoke execute on function public.sync_apply(jsonb) from public, anon;
revoke execute on function public.resolve_conflict(uuid, text) from public, anon;
grant execute on function public.sync_apply(jsonb), public.resolve_conflict(uuid, text) to authenticated;
-- (السجل بيتقرا بالترتيب من آخر رقم الجهاز شافه — بيستخدم المفتاح الأساسي id فمش محتاج فهرس زيادة)

-- =====================================================
-- المستخدمين (الإصدار 5): اسم عرض لكل مستخدم + حد أقصى مستخدمين اتنين بنفس الصلاحيات
-- =====================================================
alter table public.members add column if not exists display_name text;
create or replace function public.members_count()
returns int language sql stable security definer set search_path = public as $$ select count(*)::int from public.members $$;
revoke execute on function public.members_count() from public, anon;
grant execute on function public.members_count() to authenticated;
drop policy if exists members_add on public.members;
create policy members_add on public.members for insert to authenticated
  with check ((select public.is_member()) and is_owner = false and (select public.members_count()) < 2);
drop policy if exists members_upd on public.members;
create policy members_upd on public.members for update to authenticated
  using ((select public.is_member())) with check ((select public.is_member()));
revoke update on public.members from authenticated, anon;
grant update (display_name) on public.members to authenticated;

-- =====================================================
-- الفاتورة ممكن تكون أكتر من صفحة (الإصدار 6): الصفحة الأولى في image_path والباقي هنا
-- =====================================================
alter table public.invoices add column if not exists extra_images text[] not null default '{}';
-- الدفعات والشيكات والمرتجعات كمان ممكن يبقى ليها أكتر من صورة
alter table public.payments add column if not exists extra_images text[] not null default '{}';

-- =====================================================
-- سداد الشيكات على دفعات (الإصدار 7)
-- قيمة الشيك الأصلية مبتتغيرش. كل دفعة سداد صف مستقل في check_payments.
-- أثر الشيك على حساب المورد (من غير تكرار):
--   شيك لسه/مسدد جزئي/مسدد بالكامل  → قيمته الأصلية من تاريخ كتابته (نفس سياسة التطبيق قبل كده)
--   شيك مرتد/ملغي/مستبدل            → اللي اتسدد منه فعلًا بس (مجموع دفعات السداد المعتمدة)
-- =====================================================
alter table public.payments drop constraint if exists payments_check_status_check;
alter table public.payments add constraint payments_check_status_check
  check (check_status in ('pending','cleared','bounced','cancelled','replaced'));
alter table public.payments add column if not exists replaced_by bigint references public.payments(id) on delete set null;

create table if not exists public.check_payments (
  id           bigint generated always as identity primary key,
  payment_id   bigint not null references public.payments(id) on delete restrict,
  pay_date     date not null default current_date,
  amount       numeric(14,2) not null check (amount > 0),
  method       text not null check (method in ('cash','transfer','instapay','wallet','bank_debit','other')),
  account      text,                -- الحساب اللي خرج منه المبلغ (لحد ما أقسام الخزينة والبنوك تتعمل)
  ref_no       text,
  image_path   text,
  extra_images text[] not null default '{}',
  notes        text,
  voided       boolean not null default false,   -- الإلغاء بدل الحذف عشان الأثر المحاسبي مايضيعش
  void_reason  text,
  voided_at    timestamptz,
  created_by   text not null default public.current_email(),
  created_at   timestamptz not null default now()
);
create index if not exists check_payments_pay_idx on public.check_payments(payment_id);

-- حارس السداد: مايعديش قيمة الشيك (حتى لو جهازين سجلوا في نفس اللحظة) ومينفعش يتمسح
create or replace function public.check_payments_guard()
returns trigger language plpgsql set search_path = public as $$
declare chk public.payments%rowtype; s numeric;
begin
  if tg_op = 'DELETE' then raise exception 'دفعة سداد الشيك مبتتمسحش — اعملها إلغاء'; end if;
  select * into chk from public.payments where id = new.payment_id for update;   -- قفل الشيك
  if not found or chk.method <> 'check' then raise exception 'الدفعة دي مش مربوطة بشيك'; end if;
  if tg_op = 'UPDATE' and new.payment_id <> old.payment_id then raise exception 'مينفعش تنقل الدفعة لشيك تاني'; end if;
  if tg_op = 'UPDATE' and old.voided and not new.voided then raise exception 'الدفعة الملغية مبترجعش'; end if;
  if not new.voided then
    if chk.check_status in ('cancelled','replaced') and tg_op = 'INSERT' then raise exception 'الشيك ده ملغي أو مستبدل'; end if;
    select coalesce(sum(amount), 0) into s from public.check_payments
      where payment_id = new.payment_id and not voided and id <> coalesce(new.id, -1);
    if s + new.amount > chk.amount then
      raise exception 'مجموع السداد (%) أكبر من قيمة الشيك (%)', s + new.amount, chk.amount;
    end if;
  end if;
  if new.voided and new.voided_at is null then new.voided_at := now(); end if;
  return new;
end $$;
drop trigger if exists check_payments_guard on public.check_payments;
create trigger check_payments_guard before insert or update or delete on public.check_payments
  for each row execute function public.check_payments_guard();

-- قيمة الشيك مينفعش تقل عن اللي اتسدد منه
create or replace function public.payments_check_guard()
returns trigger language plpgsql set search_path = public as $$
declare s numeric;
begin
  if old.method = 'check' then
    select coalesce(sum(amount), 0) into s from public.check_payments where payment_id = old.id and not voided;
    if s > 0 and (new.method <> 'check' or new.amount < s) then
      raise exception 'الشيك اتسدد منه % — مينفعش قيمته تقل عن كده أو يتغير نوعه', s;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists payments_check_guard on public.payments;
create trigger payments_check_guard before update on public.payments
  for each row execute function public.payments_check_guard();

-- سجل التعديلات: دفعات السداد بتتسجل على المورد بتاع الشيك
create or replace function public.log_activity()
returns trigger language plpgsql security definer set search_path = public as $$
declare o jsonb; n jsonb; sid bigint; eid text;
begin
  if tg_op <> 'INSERT' then o := to_jsonb(old); end if;
  if tg_op <> 'DELETE' then n := to_jsonb(new); end if;
  if tg_table_name = 'suppliers' then sid := coalesce(n->>'id', o->>'id')::bigint;
  elsif tg_table_name in ('invoices','payments') then sid := coalesce(n->>'supplier_id', o->>'supplier_id')::bigint;
  elsif tg_table_name = 'check_payments' then
    select supplier_id into sid from public.payments where id = coalesce(n->>'payment_id', o->>'payment_id')::bigint;
  end if;
  eid := coalesce(n->>'id', o->>'id', n->>'email', o->>'email');
  if tg_op = 'UPDATE' and o = n then return new; end if;
  insert into public.activity_log(action, entity, entity_id, supplier_id, old_row, new_row)
  values (lower(tg_op), tg_table_name, eid, sid, o, n);
  return coalesce(new, old);
end $$;

alter table public.check_payments enable row level security;
drop policy if exists check_payments_all on public.check_payments;
create policy check_payments_all on public.check_payments for all to authenticated
  using ((select public.is_member())) with check ((select public.is_member()));
drop trigger if exists check_payments_log on public.check_payments;
create trigger check_payments_log after insert or update or delete on public.check_payments
  for each row execute function public.log_activity();
grant select, insert, update on public.check_payments to authenticated;
revoke delete on public.check_payments from authenticated;
revoke all on public.check_payments from anon;
grant usage, select on all sequences in schema public to authenticated;

-- رصيد المورد على السيرفر بنفس القاعدة
drop view if exists public.supplier_balances;
create view public.supplier_balances with (security_invoker = true) as
with cp as (select payment_id, sum(amount) settled from public.check_payments where not voided group by payment_id),
pe as (select p.supplier_id, p.method, p.check_status, p.amount, p.pay_date,
         case when p.method = 'check' and p.check_status in ('bounced','cancelled','replaced') then coalesce(cp.settled, 0)
              when p.method in ('cash','check','transfer') then p.amount else 0 end eff,
         case when p.method = 'check' and p.check_status = 'pending' then p.amount - coalesce(cp.settled, 0) else 0 end remaining
       from public.payments p left join cp on cp.payment_id = p.id)
select s.id, s.name, s.phone, s.notes,
  coalesce(i.total, 0) as total_invoices, coalesce(p.paid, 0) as total_paid, coalesce(p.adjust, 0) as total_adjust,
  coalesce(i.total, 0) - coalesce(p.paid, 0) - coalesce(p.adjust, 0) as balance,
  coalesce(p.pending_checks, 0) as pending_checks, greatest(i.last_date, p.last_date) as last_activity
from public.suppliers s
left join (select supplier_id, sum(amount) total, max(inv_date) last_date from public.invoices group by supplier_id) i on i.supplier_id = s.id
left join (select supplier_id, sum(eff) paid, sum(amount) filter (where method in ('return','discount')) adjust,
                  sum(remaining) pending_checks, max(pay_date) last_date from pe group by supplier_id) p on p.supplier_id = s.id;
grant select on public.supplier_balances to authenticated;

-- =====================================================
-- النسخ الاحتياطي (الإصدار 8): سجل كل نسخة (التلقائية من GitHub Actions واليدوية من التطبيق)
-- التلقائية بتتسجل من GitHub بصلاحية قاعدة البيانات. التطبيق يقدر يقرا ويسجل نسخة يدوية بس.
-- =====================================================
create table if not exists public.backup_runs (
  id          bigint generated always as identity primary key,
  kind        text not null check (kind in ('auto','manual')),
  ok          boolean not null,
  verified    boolean not null default false,
  size_bytes  bigint,
  rows_total  bigint,
  details     jsonb,
  release_tag text,
  run_url     text,
  error       text,
  created_by  text not null default coalesce(public.current_email(), 'github-actions'),
  created_at  timestamptz not null default now()
);
create index if not exists backup_runs_at_idx on public.backup_runs(created_at desc);
alter table public.backup_runs enable row level security;
drop policy if exists backup_runs_read on public.backup_runs;
create policy backup_runs_read on public.backup_runs for select to authenticated using ((select public.is_member()));
drop policy if exists backup_runs_manual on public.backup_runs;
create policy backup_runs_manual on public.backup_runs for insert to authenticated
  with check ((select public.is_member()) and kind = 'manual');
revoke all on public.backup_runs from anon;
revoke update, delete on public.backup_runs from authenticated;
grant select, insert on public.backup_runs to authenticated;

-- =====================================================
-- القروض (الإصدار 9): قروض البنوك والأقساط والغرامات
--   total_amount  = إجمالي مبلغ القرض (اللي هيتسدد على الأقساط)
--   net_received  = المبلغ اللي استلمته فعلًا بعد خصم الفايدة
--   interest_rate = نسبة الفايدة (%)
--   loan_payments.amount  = المسدد من القسط نفسه، penalty = غرامة التأخير (منفصلة)
-- =====================================================
create table if not exists public.loans (
  id                 bigint generated always as identity primary key,
  bank               text not null,
  total_amount       numeric(14,2) not null check (total_amount > 0),
  net_received       numeric(14,2) not null check (net_received >= 0),
  interest_rate      numeric(7,3),
  start_date         date not null default current_date,
  installments_count int check (installments_count is null or installments_count > 0),
  installment_amount numeric(14,2) check (installment_amount is null or installment_amount > 0),
  first_due_date     date,
  account_no         text,
  notes              text,
  status             text not null default 'active' check (status in ('active','closed')),
  image_path         text,
  extra_images       text[] not null default '{}',
  created_by         text not null default public.current_email(),
  created_at         timestamptz not null default now()
);
create table if not exists public.loan_payments (
  id           bigint generated always as identity primary key,
  loan_id      bigint not null references public.loans(id) on delete restrict,
  pay_date     date not null default current_date,
  due_date     date,
  amount       numeric(14,2) not null default 0 check (amount >= 0),
  penalty      numeric(14,2) not null default 0 check (penalty >= 0),
  method       text,
  notes        text,
  image_path   text,
  extra_images text[] not null default '{}',
  created_by   text not null default public.current_email(),
  created_at   timestamptz not null default now(),
  check (amount > 0 or penalty > 0)
);
create index if not exists loan_payments_loan_idx on public.loan_payments(loan_id, pay_date);
alter table public.loans enable row level security;
alter table public.loan_payments enable row level security;
drop policy if exists loans_all on public.loans;
create policy loans_all on public.loans for all to authenticated using ((select public.is_member())) with check ((select public.is_member()));
drop policy if exists loan_payments_all on public.loan_payments;
create policy loan_payments_all on public.loan_payments for all to authenticated using ((select public.is_member())) with check ((select public.is_member()));
drop trigger if exists loans_log on public.loans;
create trigger loans_log after insert or update or delete on public.loans for each row execute function public.log_activity();
drop trigger if exists loan_payments_log on public.loan_payments;
create trigger loan_payments_log after insert or update or delete on public.loan_payments for each row execute function public.log_activity();
grant select, insert, update, delete on public.loans, public.loan_payments to authenticated;
revoke all on public.loans, public.loan_payments from anon;
grant usage, select on all sequences in schema public to authenticated;

-- القروض (الإصدار 9.1): جدول أقساط متعدّل يدويًا (تاريخ وقيمة كل قسط) — لو فاضي بيتحسب من عدد الأقساط وأول ميعاد
alter table public.loans add column if not exists schedule jsonb;

-- الخزينة (الإصدار 10): المبيع اليومي لكل فرع — كاش + تحويلات
create table if not exists public.daily_sales (
  id            bigint generated always as identity primary key,
  sale_date     date not null default current_date,
  branch        text not null check (branch in ('ورد','زهرة')),
  cash          numeric(14,2) not null default 0 check (cash >= 0),
  transfer      numeric(14,2) not null default 0 check (transfer >= 0),
  transfer_note text,
  notes         text,
  created_by    text not null default public.current_email(),
  created_at    timestamptz not null default now(),
  check (cash > 0 or transfer > 0)
);
create index if not exists daily_sales_date_idx on public.daily_sales(sale_date, branch);
alter table public.daily_sales enable row level security;
drop policy if exists daily_sales_all on public.daily_sales;
create policy daily_sales_all on public.daily_sales for all to authenticated using ((select public.is_member())) with check ((select public.is_member()));
drop trigger if exists daily_sales_log on public.daily_sales;
create trigger daily_sales_log after insert or update or delete on public.daily_sales for each row execute function public.log_activity();
grant select, insert, update, delete on public.daily_sales to authenticated;
revoke all on public.daily_sales from anon;
grant usage, select on all sequences in schema public to authenticated;

-- مراقبة حدود الخطة المجانية (الإصدار 11): حجم قاعدة البيانات والصور وعدد المستخدمين — للأعضاء بس
create or replace function public.usage_stats() returns json
language plpgsql security definer set search_path = public, pg_catalog stable as $$
declare st bigint := null; nf bigint := null; nu bigint := null;
begin
  if not public.is_member() then return null; end if;
  if to_regclass('storage.objects') is not null then
    begin execute 'select coalesce(sum((metadata->>''size'')::bigint),0), count(*) from storage.objects' into st, nf;
    exception when others then execute 'select count(*) from storage.objects' into nf; end;
  end if;
  if to_regclass('auth.users') is not null then execute 'select count(*) from auth.users' into nu; end if;
  return json_build_object('db_bytes', pg_database_size(current_database()), 'storage_bytes', st, 'files', nf, 'users', nu, 'at', now());
end $$;
revoke execute on function public.usage_stats() from public, anon;
grant execute on function public.usage_stats() to authenticated;

-- النسخ الاحتياطي من غير رابط قاعدة البيانات (الإصدار 12): بيستخدم المفتاح السري بس
-- backup_counts: عدد السجلات في كل جدول + الإجماليات اللي النسخة المسترجعة لازم تطابقها
create or replace function public.backup_counts() returns json
language plpgsql security definer set search_path = public, pg_catalog stable as $$
declare c json; t json;
begin
  select json_object_agg(relname, n) into c from (
    select k.relname, (xpath('/row/n/text()', query_to_xml(format('select count(*) n from public.%I', k.relname), false, true, '')))[1]::text::bigint n
    from pg_class k join pg_namespace s on s.oid = k.relnamespace
    where s.nspname = 'public' and k.relkind = 'r' and k.relname <> 'backup_runs' order by 1) x;
  t := json_build_object(
     'supplier_balance', (select coalesce(sum(balance),0)::text from public.supplier_balances),
     'supplier_pending_checks', (select coalesce(sum(pending_checks),0)::text from public.supplier_balances),
     'invoices', (select coalesce(sum(amount),0)::text from public.invoices),
     'payments', (select coalesce(sum(amount),0)::text from public.payments),
     'check_payments', (select coalesce(sum(amount),0)::text from public.check_payments where not voided),
     'employee_balance', (select coalesce(sum(balance),0)::text from public.employee_balances),
     'loans', (select coalesce(sum(total_amount),0)::text from public.loans),
     'loan_payments', (select coalesce(sum(amount + penalty),0)::text from public.loan_payments),
     'daily_sales', (select coalesce(sum(cash + transfer),0)::text from public.daily_sales),
     'expenses', (select coalesce(sum(amount),0)::text from public.expenses),
     'bank_moves', (select coalesce(sum(amount),0)::text from public.bank_moves));
  return json_build_object('counts', c, 'totals', t);
end $$;
-- backup_storage_list: قائمة الصور (المكان والحجم والبصمة) عشان ننزّل الجديد بس
create or replace function public.backup_storage_list() returns json
language plpgsql security definer set search_path = public, pg_catalog stable as $$
declare r json;
begin
  if to_regclass('storage.objects') is null then return '[]'::json; end if;
  execute $q$select coalesce(json_agg(json_build_object('bucket', bucket_id, 'name', name, 'etag', coalesce(metadata->>'eTag',''), 'size', coalesce(metadata->>'size','0'), 'mime', coalesce(metadata->>'mimetype','')) order by bucket_id, name), '[]'::json) from storage.objects$q$ into r;
  return r;
end $$;
revoke execute on function public.backup_counts(), public.backup_storage_list() from public, anon, authenticated;
do $$ begin if exists (select 1 from pg_roles where rolname = 'service_role') then
  grant execute on function public.backup_counts(), public.backup_storage_list() to service_role;
end if; end $$;
-- المفتاح السري (service_role) للنسخ الاحتياطي: قراءة بس لكل الجداول + تسجيل نتيجة النسخة
do $$ begin if exists (select 1 from pg_roles where rolname = 'service_role') then
  grant usage on schema public to service_role;
  grant select on all tables in schema public to service_role;
  alter default privileges in schema public grant select on tables to service_role;
  grant insert on public.backup_runs to service_role;
  grant usage, select on all sequences in schema public to service_role;
end if; end $$;

-- المصروفات (الإصدار 13): المصروفات اليدوية بس (إيجار، كهربا، ...). دفعات الموردين وأقساط القروض وصرف الموظفين
-- بتتحسب في المصروفات تلقائي من جداولها (مبتتنسخش هنا) — فمفيش تكرار، وأي تعديل في الأصل بيظهر على طول.
create table if not exists public.expenses (
  id           bigint generated always as identity primary key,
  exp_date     date not null default current_date,
  branch       text not null check (branch in ('ورد','زهرة','مشترك')),
  category     text not null,
  amount       numeric(14,2) not null check (amount > 0),
  notes        text,
  image_path   text,
  extra_images text[] not null default '{}',
  created_by   text not null default public.current_email(),
  created_at   timestamptz not null default now()
);
create index if not exists expenses_date_idx on public.expenses(exp_date, branch);
alter table public.expenses enable row level security;
drop policy if exists expenses_all on public.expenses;
create policy expenses_all on public.expenses for all to authenticated using ((select public.is_member())) with check ((select public.is_member()));
drop trigger if exists expenses_log on public.expenses;
create trigger expenses_log after insert or update or delete on public.expenses for each row execute function public.log_activity();
grant select, insert, update, delete on public.expenses to authenticated;
revoke all on public.expenses from anon;
grant usage, select on all sequences in schema public to authenticated;
do $$ begin if exists (select 1 from pg_roles where rolname = 'service_role') then grant select on public.expenses to service_role; end if; end $$;

-- البنك (الإصدار 14): حساب بنك واحد. رصيده بيتحسب في التطبيق من مكانه (مبيتنسخش):
--   + تحويلات المبيع (daily_sales.transfer)  − دفعات الموردين بالتحويل  − سداد الشيكات من البنك
--   − أقساط القروض (لو مش كاش)  − صرف/سلف الموظفين بالتحويل  ± الحركات اليدوية هنا
-- bank_moves = الحركات اليدوية بس: رصيد أول المدة، إيداع من الخزينة، سحب للخزينة، مصاريف بنكية، إضافة/خصم تاني
create table if not exists public.bank_moves (
  id           bigint generated always as identity primary key,
  move_date    date not null default current_date,
  kind         text not null check (kind in ('opening','deposit','withdraw','fee','in','out')),
  amount       numeric(14,2) not null check (amount > 0),
  notes        text,
  image_path   text,
  extra_images text[] not null default '{}',
  created_by   text not null default public.current_email(),
  created_at   timestamptz not null default now()
);
create index if not exists bank_moves_date_idx on public.bank_moves(move_date);
alter table public.bank_moves enable row level security;
drop policy if exists bank_moves_all on public.bank_moves;
create policy bank_moves_all on public.bank_moves for all to authenticated using ((select public.is_member())) with check ((select public.is_member()));
drop trigger if exists bank_moves_log on public.bank_moves;
create trigger bank_moves_log after insert or update or delete on public.bank_moves for each row execute function public.log_activity();
grant select, insert, update, delete on public.bank_moves to authenticated;
revoke all on public.bank_moves from anon;
grant usage, select on all sequences in schema public to authenticated;
do $$ begin if exists (select 1 from pg_roles where rolname = 'service_role') then grant select on public.bank_moves to service_role; end if; end $$;
-- طريقة صرف/سلفة الموظف: null أو cash = كاش من الخزينة، transfer = تحويل من البنك
alter table public.emp_transactions add column if not exists method text;
alter table public.emp_transactions drop constraint if exists emp_transactions_method_check;
alter table public.emp_transactions add constraint emp_transactions_method_check check (method is null or method in ('cash','transfer'));
