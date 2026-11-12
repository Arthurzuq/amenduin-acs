-- ACS 7.0 — team treasuries, player wallets, weekly payroll and tournament prizes.
-- This migration has already been applied to the connected Supabase project.
-- Run once when installing ACS 7.0 on another database.

create table if not exists public.team_economy_accounts (
  team_id uuid primary key references public.teams(id) on delete cascade,
  salary_balance numeric(14,2) not null default 0 check (salary_balance >= 0),
  last_grant_week date,
  updated_at timestamptz not null default now()
);

create table if not exists public.player_wallets (
  player_id uuid primary key references public.players(id) on delete cascade,
  balance numeric(14,2) not null default 0 check (balance >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.team_salary_contracts (
  team_id uuid not null references public.teams(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  weekly_salary numeric(14,2) not null default 0 check (weekly_salary >= 0 and weekly_salary <= 1000000),
  active boolean not null default true,
  set_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (team_id, player_id)
);

create table if not exists public.team_salary_runs (
  team_id uuid not null references public.teams(id) on delete cascade,
  period_start date not null,
  total_amount numeric(14,2) not null check (total_amount > 0),
  paid_by uuid references auth.users(id) on delete set null,
  paid_at timestamptz not null default now(),
  primary key (team_id, period_start)
);

create table if not exists public.economy_transactions (
  id uuid primary key default gen_random_uuid(),
  wallet_type text not null check (wallet_type in ('team','player')),
  team_id uuid references public.teams(id) on delete cascade,
  player_id uuid references public.players(id) on delete cascade,
  transaction_type text not null check (transaction_type in ('weekly_grant','salary_payment','tournament_prize','player_transfer')),
  direction text not null check (direction in ('credit','debit')),
  amount numeric(14,2) not null check (amount > 0),
  description text not null,
  reference_key text not null unique,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint economy_transactions_wallet_owner_check check (
    (wallet_type='team' and team_id is not null and player_id is null)
    or (wallet_type='player' and player_id is not null and team_id is null)
  )
);

create index if not exists economy_transactions_team_history_idx
  on public.economy_transactions(team_id, created_at desc) where wallet_type='team';
create index if not exists economy_transactions_player_history_idx
  on public.economy_transactions(player_id, created_at desc) where wallet_type='player';

create table if not exists public.tournament_prize_awards (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  placement integer not null check (placement between 1 and 5),
  tier text not null check (tier in ('E','D','C','B','A','S')),
  amount numeric(14,2) not null check (amount > 0),
  awarded_by uuid references auth.users(id) on delete set null,
  awarded_at timestamptz not null default now(),
  unique (tournament_id, team_id),
  unique (tournament_id, placement)
);

-- Provision accounts for all teams and player profiles that already exist.
insert into public.team_economy_accounts(team_id,last_grant_week)
select t.id, date_trunc('week', timezone('America/Sao_Paulo', now()))::date - 7
from public.teams t
on conflict (team_id) do nothing;

insert into public.player_wallets(player_id)
select p.id from public.players p
on conflict (player_id) do nothing;

-- Automatically create wallets for newly created teams and players.
create or replace function public.acs_economy_ensure_wallet_account()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
begin
  if tg_table_name = 'teams' then
    insert into public.team_economy_accounts(team_id,last_grant_week)
    values(new.id, date_trunc('week', timezone('America/Sao_Paulo', now()))::date - 7)
    on conflict (team_id) do nothing;
  elsif tg_table_name = 'players' then
    insert into public.player_wallets(player_id)
    values(new.id)
    on conflict (player_id) do nothing;
  end if;
  return new;
end;
$function$;

drop trigger if exists acs_economy_team_account_after_insert on public.teams;
create trigger acs_economy_team_account_after_insert
after insert on public.teams
for each row execute function public.acs_economy_ensure_wallet_account();

drop trigger if exists acs_economy_player_wallet_after_insert on public.players;
create trigger acs_economy_player_wallet_after_insert
after insert on public.players
for each row execute function public.acs_economy_ensure_wallet_account();

-- A departing player must not continue receiving that team's payroll.
create or replace function public.acs_economy_deactivate_departing_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
begin
  update public.team_salary_contracts
  set active=false, updated_at=now()
  where team_id=old.team_id and player_id=old.player_id;
  return old;
end;
$function$;

drop trigger if exists acs_economy_member_removed on public.team_members;
create trigger acs_economy_member_removed
after delete on public.team_members
for each row execute function public.acs_economy_deactivate_departing_member();

-- Exposed tables have RLS, explicit Data API grants and no direct write privileges.
alter table public.team_economy_accounts enable row level security;
alter table public.player_wallets enable row level security;
alter table public.team_salary_contracts enable row level security;
alter table public.team_salary_runs enable row level security;
alter table public.economy_transactions enable row level security;
alter table public.tournament_prize_awards enable row level security;

revoke all on public.team_economy_accounts from anon, authenticated;
revoke all on public.player_wallets from anon, authenticated;
revoke all on public.team_salary_contracts from anon, authenticated;
revoke all on public.team_salary_runs from anon, authenticated;
revoke all on public.economy_transactions from anon, authenticated;
revoke all on public.tournament_prize_awards from anon, authenticated;

grant select on public.team_economy_accounts to authenticated;
grant select on public.player_wallets to authenticated;
grant select on public.team_salary_contracts to authenticated;
grant select on public.team_salary_runs to authenticated;
grant select on public.economy_transactions to authenticated;
grant select on public.tournament_prize_awards to anon, authenticated;

drop policy if exists "Team captains and admins read salary treasury" on public.team_economy_accounts;
create policy "Team captains and admins read salary treasury"
on public.team_economy_accounts for select to authenticated
using (
  public.acs_is_admin()
  or exists (
    select 1 from public.team_members tm
    join public.players p on p.id=tm.player_id
    where tm.team_id=team_economy_accounts.team_id
      and tm.role='captain' and p.user_id=auth.uid()
  )
);

drop policy if exists "Players and admins read personal wallets" on public.player_wallets;
create policy "Players and admins read personal wallets"
on public.player_wallets for select to authenticated
using (
  public.acs_is_admin()
  or exists (select 1 from public.players p where p.id=player_wallets.player_id and p.user_id=auth.uid())
);

drop policy if exists "Players captains and admins read salary contracts" on public.team_salary_contracts;
create policy "Players captains and admins read salary contracts"
on public.team_salary_contracts for select to authenticated
using (
  public.acs_is_admin()
  or exists (select 1 from public.players p where p.id=team_salary_contracts.player_id and p.user_id=auth.uid())
  or exists (
    select 1 from public.team_members tm
    join public.players p on p.id=tm.player_id
    where tm.team_id=team_salary_contracts.team_id
      and tm.role='captain' and p.user_id=auth.uid()
  )
);

drop policy if exists "Captains and admins read salary runs" on public.team_salary_runs;
create policy "Captains and admins read salary runs"
on public.team_salary_runs for select to authenticated
using (
  public.acs_is_admin()
  or exists (
    select 1 from public.team_members tm
    join public.players p on p.id=tm.player_id
    where tm.team_id=team_salary_runs.team_id
      and tm.role='captain' and p.user_id=auth.uid()
  )
);

drop policy if exists "Users read their own and captained team transactions" on public.economy_transactions;
create policy "Users read their own and captained team transactions"
on public.economy_transactions for select to authenticated
using (
  public.acs_is_admin()
  or (
    wallet_type='player'
    and exists (select 1 from public.players p where p.id=economy_transactions.player_id and p.user_id=auth.uid())
  )
  or (
    wallet_type='team'
    and exists (
      select 1 from public.team_members tm
      join public.players p on p.id=tm.player_id
      where tm.team_id=economy_transactions.team_id
        and tm.role='captain' and p.user_id=auth.uid()
    )
  )
);

drop policy if exists "Public can read tournament prize awards" on public.tournament_prize_awards;
create policy "Public can read tournament prize awards"
on public.tournament_prize_awards for select to anon, authenticated
using (true);

-- Catch up all weekly $1,000 team grants on first visit in the new São Paulo week.
-- Reference keys and row locks make each team's weekly grant idempotent.
create or replace function public.economy_claim_weekly_grant(p_team_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $function$
declare
  v_authorized boolean;
  v_balance numeric(14,2);
  v_last_week date;
  v_current_week date := date_trunc('week', timezone('America/Sao_Paulo', now()))::date;
  v_next_week date;
  v_weeks integer := 0;
  v_total numeric(14,2) := 0;
  v_rows integer;
begin
  if auth.uid() is null then raise exception 'Entre na sua conta.'; end if;

  select exists (
    select 1 from public.team_members tm
    join public.players p on p.id=tm.player_id
    where tm.team_id=p_team_id and tm.role='captain' and p.user_id=auth.uid()
  ) or public.acs_is_admin()
  into v_authorized;
  if not v_authorized then raise exception 'Somente o capitão pode acessar o saldo da equipe.'; end if;

  insert into public.team_economy_accounts(team_id,last_grant_week)
  values(p_team_id,v_current_week-7)
  on conflict (team_id) do nothing;

  select salary_balance,last_grant_week
  into v_balance,v_last_week
  from public.team_economy_accounts
  where team_id=p_team_id
  for update;

  v_next_week := coalesce(v_last_week+7,v_current_week);
  while v_next_week <= v_current_week loop
    insert into public.economy_transactions(
      wallet_type,team_id,transaction_type,direction,amount,description,reference_key,created_by
    ) values (
      'team',p_team_id,'weekly_grant','credit',1000,
      'Repasse semanal para a folha salarial',
      'weekly-grant:'||p_team_id::text||':'||v_next_week::text,
      auth.uid()
    )
    on conflict (reference_key) do nothing;

    get diagnostics v_rows = row_count;
    if v_rows=1 then
      v_total := v_total+1000;
      v_weeks := v_weeks+1;
    end if;
    v_next_week := v_next_week+7;
  end loop;

  update public.team_economy_accounts
  set salary_balance=salary_balance+v_total,
      last_grant_week=v_current_week,
      updated_at=now()
  where team_id=p_team_id
  returning salary_balance into v_balance;

  return jsonb_build_object('weeks_credited',v_weeks,'credited_amount',v_total,'salary_balance',v_balance);
end;
$function$;

-- Captains define a weekly salary for a registered player on their current roster.
create or replace function public.economy_set_player_salary(
  p_team_id uuid,
  p_player_id uuid,
  p_weekly_salary numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $function$
declare
  v_authorized boolean;
  v_name text;
begin
  if auth.uid() is null then raise exception 'Entre na sua conta.'; end if;
  if p_weekly_salary is null or p_weekly_salary < 0 or p_weekly_salary > 1000000 then
    raise exception 'Informe um salário semanal válido entre $0 e $1.000.000.';
  end if;

  select exists (
    select 1 from public.team_members tm
    join public.players p on p.id=tm.player_id
    where tm.team_id=p_team_id and tm.role='captain' and p.user_id=auth.uid()
  ) or public.acs_is_admin()
  into v_authorized;
  if not v_authorized then raise exception 'Somente o capitão pode definir salários.'; end if;

  select nickname into v_name from public.players where id=p_player_id;
  if v_name is null then raise exception 'Jogador não encontrado.'; end if;
  if not exists(select 1 from public.team_members where team_id=p_team_id and player_id=p_player_id) then
    raise exception 'O jogador não pertence a esta equipe.';
  end if;

  insert into public.team_salary_contracts(team_id,player_id,weekly_salary,active,set_by,updated_at)
  values(p_team_id,p_player_id,p_weekly_salary,p_weekly_salary>0,auth.uid(),now())
  on conflict (team_id,player_id) do update
  set weekly_salary=excluded.weekly_salary,
      active=excluded.active,
      set_by=auth.uid(),
      updated_at=now();

  return jsonb_build_object('player_id',p_player_id,'player_name',v_name,'weekly_salary',p_weekly_salary,'active',p_weekly_salary>0);
end;
$function$;

-- Pay the active weekly salary run atomically, exactly once per team/week.
create or replace function public.economy_pay_team_payroll(p_team_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $function$
declare
  v_authorized boolean;
  v_period date := date_trunc('week', timezone('America/Sao_Paulo', now()))::date;
  v_balance numeric(14,2);
  v_total numeric(14,2);
  v_count integer := 0;
  v_rows integer;
  r record;
begin
  if auth.uid() is null then raise exception 'Entre na sua conta.'; end if;
  select exists (
    select 1 from public.team_members tm
    join public.players p on p.id=tm.player_id
    where tm.team_id=p_team_id and tm.role='captain' and p.user_id=auth.uid()
  ) or public.acs_is_admin()
  into v_authorized;
  if not v_authorized then raise exception 'Somente o capitão pode pagar a folha.'; end if;

  insert into public.team_economy_accounts(team_id,last_grant_week)
  values(p_team_id,v_period-7)
  on conflict (team_id) do nothing;

  select salary_balance into v_balance
  from public.team_economy_accounts
  where team_id=p_team_id
  for update;

  select coalesce(sum(c.weekly_salary),0)
  into v_total
  from public.team_salary_contracts c
  join public.team_members tm on tm.team_id=c.team_id and tm.player_id=c.player_id
  where c.team_id=p_team_id and c.active=true and c.weekly_salary>0;

  if v_total<=0 then raise exception 'Defina ao menos um salário antes de pagar a folha.'; end if;
  if v_balance<v_total then
    raise exception 'Saldo insuficiente. A folha custa $%, mas a equipe possui $%.',v_total,v_balance;
  end if;

  insert into public.team_salary_runs(team_id,period_start,total_amount,paid_by)
  values(p_team_id,v_period,v_total,auth.uid())
  on conflict (team_id,period_start) do nothing;
  get diagnostics v_rows = row_count;
  if v_rows=0 then raise exception 'A folha salarial desta semana já foi paga.'; end if;

  update public.team_economy_accounts
  set salary_balance=salary_balance-v_total,updated_at=now()
  where team_id=p_team_id
  returning salary_balance into v_balance;

  for r in
    select c.player_id,c.weekly_salary,p.nickname
    from public.team_salary_contracts c
    join public.team_members tm on tm.team_id=c.team_id and tm.player_id=c.player_id
    join public.players p on p.id=c.player_id
    where c.team_id=p_team_id and c.active=true and c.weekly_salary>0
    order by c.player_id
  loop
    insert into public.player_wallets(player_id) values(r.player_id) on conflict (player_id) do nothing;
    update public.player_wallets
    set balance=balance+r.weekly_salary,updated_at=now()
    where player_id=r.player_id;

    insert into public.economy_transactions(
      wallet_type,team_id,transaction_type,direction,amount,description,reference_key,created_by
    ) values (
      'team',p_team_id,'salary_payment','debit',r.weekly_salary,
      'Salário semanal pago a '||r.nickname,
      'salary-team:'||p_team_id::text||':'||r.player_id::text||':'||v_period::text,
      auth.uid()
    );

    insert into public.economy_transactions(
      wallet_type,player_id,transaction_type,direction,amount,description,reference_key,created_by
    ) values (
      'player',r.player_id,'salary_payment','credit',r.weekly_salary,
      'Salário semanal recebido de sua equipe',
      'salary-player:'||p_team_id::text||':'||r.player_id::text||':'||v_period::text,
      auth.uid()
    );
    v_count:=v_count+1;
  end loop;

  return jsonb_build_object('players_paid',v_count,'total_paid',v_total,'team_balance',v_balance,'period_start',v_period);
end;
$function$;

-- Player wallets can send money to another player's registered profile.
create or replace function public.economy_transfer_player_balance(
  p_recipient_player_id uuid,
  p_amount numeric,
  p_description text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $function$
declare
  v_sender uuid;
  v_sender_balance numeric(14,2);
  v_recipient_balance numeric(14,2);
  v_description text;
  v_reference uuid := gen_random_uuid();
begin
  if auth.uid() is null then raise exception 'Entre na sua conta.'; end if;
  if p_amount is null or p_amount<=0 or p_amount>1000000 then
    raise exception 'Informe um valor positivo de até $1.000.000.';
  end if;

  select id into v_sender from public.players where user_id=auth.uid() limit 1;
  if v_sender is null then raise exception 'Sua conta não possui um perfil de jogador.'; end if;
  if p_recipient_player_id is null or p_recipient_player_id=v_sender then
    raise exception 'Escolha outro jogador como destinatário.';
  end if;
  if not exists(select 1 from public.players where id=p_recipient_player_id) then
    raise exception 'Jogador destinatário não encontrado.';
  end if;

  insert into public.player_wallets(player_id)
  values(v_sender),(p_recipient_player_id)
  on conflict (player_id) do nothing;

  perform player_id
  from public.player_wallets
  where player_id in (v_sender,p_recipient_player_id)
  order by player_id
  for update;

  select balance into v_sender_balance from public.player_wallets where player_id=v_sender;
  select balance into v_recipient_balance from public.player_wallets where player_id=p_recipient_player_id;
  if v_sender_balance<p_amount then raise exception 'Saldo insuficiente para esta transferência.'; end if;

  v_description:=coalesce(nullif(left(trim(p_description),120),''),'Transferência entre jogadores');

  update public.player_wallets set balance=balance-p_amount,updated_at=now() where player_id=v_sender;
  update public.player_wallets set balance=balance+p_amount,updated_at=now() where player_id=p_recipient_player_id;

  insert into public.economy_transactions(
    wallet_type,player_id,transaction_type,direction,amount,description,reference_key,created_by
  ) values
    ('player',v_sender,'player_transfer','debit',p_amount,'Enviado: '||v_description,'player-transfer:'||v_reference::text||':debit',auth.uid()),
    ('player',p_recipient_player_id,'player_transfer','credit',p_amount,'Recebido: '||v_description,'player-transfer:'||v_reference::text||':credit',auth.uid());

  return jsonb_build_object('amount',p_amount,'sender_balance',v_sender_balance-p_amount,'recipient_balance',v_recipient_balance+p_amount);
end;
$function$;

-- Prize credits go to the team's payroll treasury.
create or replace function public.economy_award_tournament_prize(
  p_tournament_id uuid,
  p_team_id uuid,
  p_placement integer,
  p_tier text
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $function$
declare
  v_amount numeric(14,2);
  v_team_balance numeric(14,2);
  v_tier text := upper(trim(coalesce(p_tier,'')));
begin
  if auth.uid() is null or not public.acs_is_admin() then
    raise exception 'Somente administradores podem distribuir premiações.';
  end if;
  if p_placement not between 1 and 5 then raise exception 'A premiação está definida para as posições de 1º a 5º.'; end if;
  if v_tier not in ('E','D','C','B','A','S') then raise exception 'Tier inválido. Use E, D, C, B, A ou S.'; end if;
  if not exists (
    select 1 from public.tournament_registrations r
    where r.tournament_id=p_tournament_id and r.team_id=p_team_id and r.status='approved'
  ) then raise exception 'A equipe não possui inscrição aprovada neste campeonato.'; end if;

  v_amount := case p_placement
    when 1 then case v_tier when 'E' then 400 when 'D' then 750 when 'C' then 1500 when 'B' then 5000 when 'A' then 10000 when 'S' then 50000 end
    when 2 then case v_tier when 'E' then 150 when 'D' then 300 when 'C' then 800 when 'B' then 2700 when 'A' then 5300 when 'S' then 28500 end
    when 3 then case v_tier when 'E' then 40 when 'D' then 140 when 'C' then 300 when 'B' then 1400 when 'A' then 3100 when 'S' then 12800 end
    when 4 then case v_tier when 'E' then 40 when 'D' then 140 when 'C' then 300 when 'B' then 1400 when 'A' then 3100 when 'S' then 12800 end
    when 5 then case v_tier when 'E' then 10 when 'D' then 25 when 'C' then 50 when 'B' then 100 when 'A' then 200 when 'S' then 500 end
  end;

  insert into public.tournament_prize_awards(tournament_id,team_id,placement,tier,amount,awarded_by)
  values(p_tournament_id,p_team_id,p_placement,v_tier,v_amount,auth.uid());

  insert into public.team_economy_accounts(team_id,last_grant_week)
  values(p_team_id,date_trunc('week', timezone('America/Sao_Paulo', now()))::date-7)
  on conflict (team_id) do nothing;

  update public.team_economy_accounts
  set salary_balance=salary_balance+v_amount,updated_at=now()
  where team_id=p_team_id
  returning salary_balance into v_team_balance;

  insert into public.economy_transactions(
    wallet_type,team_id,transaction_type,direction,amount,description,reference_key,created_by
  ) values (
    'team',p_team_id,'tournament_prize','credit',v_amount,
    p_placement||'º lugar · Tier '||v_tier||' · premiação do campeonato',
    'tournament-prize:'||p_tournament_id::text||':'||p_team_id::text,
    auth.uid()
  );

  return jsonb_build_object('amount',v_amount,'team_balance',v_team_balance,'placement',p_placement,'tier',v_tier);
end;
$function$;

-- Do not expose the helper trigger functions as API endpoints.
revoke all on function public.acs_economy_ensure_wallet_account() from public, anon, authenticated;
revoke all on function public.acs_economy_deactivate_departing_member() from public, anon, authenticated;

-- Expose only the authenticated RPC entry points; all functions check their own authorization.
revoke all on function public.economy_claim_weekly_grant(uuid) from public, anon;
revoke all on function public.economy_set_player_salary(uuid,uuid,numeric) from public, anon;
revoke all on function public.economy_pay_team_payroll(uuid) from public, anon;
revoke all on function public.economy_transfer_player_balance(uuid,numeric,text) from public, anon;
revoke all on function public.economy_award_tournament_prize(uuid,uuid,integer,text) from public, anon;

grant execute on function public.economy_claim_weekly_grant(uuid) to authenticated;
grant execute on function public.economy_set_player_salary(uuid,uuid,numeric) to authenticated;
grant execute on function public.economy_pay_team_payroll(uuid) to authenticated;
grant execute on function public.economy_transfer_player_balance(uuid,numeric,text) to authenticated;
grant execute on function public.economy_award_tournament_prize(uuid,uuid,integer,text) to authenticated;


-- Query-plan indexes and initplan-friendly RLS predicates.
create index if not exists economy_transactions_created_by_idx on public.economy_transactions(created_by);
create index if not exists team_salary_contracts_player_id_idx on public.team_salary_contracts(player_id);
create index if not exists team_salary_contracts_set_by_idx on public.team_salary_contracts(set_by);
create index if not exists team_salary_runs_paid_by_idx on public.team_salary_runs(paid_by);
create index if not exists tournament_prize_awards_team_id_idx on public.tournament_prize_awards(team_id);
create index if not exists tournament_prize_awards_awarded_by_idx on public.tournament_prize_awards(awarded_by);
create index if not exists player_map_stats_player_id_idx on public.player_map_stats(player_id);

drop policy if exists "Team captains and admins read salary treasury" on public.team_economy_accounts;
create policy "Team captains and admins read salary treasury"
on public.team_economy_accounts for select to authenticated
using (
  (select public.acs_is_admin())
  or exists (
    select 1 from public.team_members tm
    join public.players p on p.id=tm.player_id
    where tm.team_id=team_economy_accounts.team_id
      and tm.role='captain' and p.user_id=(select auth.uid())
  )
);

drop policy if exists "Players and admins read personal wallets" on public.player_wallets;
create policy "Players and admins read personal wallets"
on public.player_wallets for select to authenticated
using (
  (select public.acs_is_admin())
  or exists (select 1 from public.players p where p.id=player_wallets.player_id and p.user_id=(select auth.uid()))
);

drop policy if exists "Players captains and admins read salary contracts" on public.team_salary_contracts;
create policy "Players captains and admins read salary contracts"
on public.team_salary_contracts for select to authenticated
using (
  (select public.acs_is_admin())
  or exists (select 1 from public.players p where p.id=team_salary_contracts.player_id and p.user_id=(select auth.uid()))
  or exists (
    select 1 from public.team_members tm
    join public.players p on p.id=tm.player_id
    where tm.team_id=team_salary_contracts.team_id
      and tm.role='captain' and p.user_id=(select auth.uid())
  )
);

drop policy if exists "Captains and admins read salary runs" on public.team_salary_runs;
create policy "Captains and admins read salary runs"
on public.team_salary_runs for select to authenticated
using (
  (select public.acs_is_admin())
  or exists (
    select 1 from public.team_members tm
    join public.players p on p.id=tm.player_id
    where tm.team_id=team_salary_runs.team_id
      and tm.role='captain' and p.user_id=(select auth.uid())
  )
);

drop policy if exists "Users read their own and captained team transactions" on public.economy_transactions;
create policy "Users read their own and captained team transactions"
on public.economy_transactions for select to authenticated
using (
  (select public.acs_is_admin())
  or (
    wallet_type='player'
    and exists (select 1 from public.players p where p.id=economy_transactions.player_id and p.user_id=(select auth.uid()))
  )
  or (
    wallet_type='team'
    and exists (
      select 1 from public.team_members tm
      join public.players p on p.id=tm.player_id
      where tm.team_id=economy_transactions.team_id
        and tm.role='captain' and p.user_id=(select auth.uid())
    )
  )
);
