-- ACS 3.3 — administração, estatísticas oficiais e exclusão de equipes
-- Execute no Supabase SQL Editor depois das migrations 3.0, 3.1 e 3.2.
create extension if not exists pgcrypto;

-- Estatísticas oficiais agregadas. Usuários comuns só podem ler.
create table if not exists public.player_competitive_stats (
  player_id uuid primary key references public.players(id) on delete cascade,
  rating_am numeric(5,2) check (rating_am between 0 and 100),
  kd numeric(7,3) check (kd >= 0),
  adr numeric(7,2) check (adr >= 0),
  headshot_pct numeric(5,2) check (headshot_pct between 0 and 100),
  win_rate numeric(5,2) check (win_rate between 0 and 100),
  matches integer not null default 0 check (matches >= 0),
  mvps integer not null default 0 check (mvps >= 0),
  kills integer not null default 0 check (kills >= 0),
  deaths integer not null default 0 check (deaths >= 0),
  first_kills integer not null default 0 check (first_kills >= 0),
  first_deaths integer not null default 0 check (first_deaths >= 0),
  clutches integer not null default 0 check (clutches >= 0),
  updated_at timestamptz not null default now()
);
alter table public.player_competitive_stats enable row level security;
drop policy if exists "Public can read competitive stats" on public.player_competitive_stats;
create policy "Public can read competitive stats" on public.player_competitive_stats for select using (true);
revoke insert, update, delete on public.player_competitive_stats from anon, authenticated;
grant select on public.player_competitive_stats to anon, authenticated;

-- Papéis administrativos: nenhum cliente pode inserir ou alterar seu próprio papel.
create table if not exists public.acs_user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('admin')),
  created_at timestamptz not null default now()
);
alter table public.acs_user_roles enable row level security;
drop policy if exists "Admins can read admin roles" on public.acs_user_roles;
revoke all on public.acs_user_roles from anon, authenticated;

-- Código de ativação de uso único. Cinco tentativas globais antes de bloqueio de 24h.
create table if not exists public.acs_admin_bootstrap (
  singleton boolean primary key default true check (singleton),
  pin_salt text not null,
  pin_hash text not null,
  consumed boolean not null default false,
  failed_attempts integer not null default 0,
  locked_until timestamptz
);
-- O PIN de ativação NÃO deve ficar salvo neste arquivo nem no GitHub.
-- Antes de executar, troque TROQUE por 5 dígitos escolhidos por você (apenas no SQL Editor, sem fazer commit).
do $$
declare
  v_pin  text := 'TROQUE';
  v_salt text := replace(gen_random_uuid()::text, '-', '');
begin
  if v_pin !~ '^[0-9]{5}$' then
    raise exception 'Defina um PIN de 5 dígitos no lugar de TROQUE antes de executar.';
  end if;
  insert into public.acs_admin_bootstrap(singleton,pin_salt,pin_hash)
  values (true, v_salt, encode(digest(v_salt || v_pin, 'sha256'), 'hex'))
  on conflict (singleton) do nothing;
end $$;
alter table public.acs_admin_bootstrap enable row level security;
revoke all on public.acs_admin_bootstrap from anon, authenticated;

create or replace function public.acs_is_admin()
returns boolean language sql stable security definer set search_path = public, auth as $$
  select exists(select 1 from public.acs_user_roles where user_id = auth.uid() and role = 'admin');
$$;
revoke all on function public.acs_is_admin() from public, anon;
grant execute on function public.acs_is_admin() to authenticated;

create or replace function public.acs_claim_admin(p_code text)
returns boolean language plpgsql security definer set search_path = public, auth, extensions as $$
declare v public.acs_admin_bootstrap%rowtype;
begin
  if auth.uid() is null then raise exception 'Entre na sua conta antes de ativar o painel.'; end if;
  if public.acs_is_admin() then return true; end if;
  select * into v from public.acs_admin_bootstrap where singleton = true for update;
  if not found or v.consumed then raise exception 'O código de ativação já foi utilizado ou não está disponível.'; end if;
  if v.locked_until is not null and v.locked_until > now() then raise exception 'Muitas tentativas. Tente novamente após o bloqueio.'; end if;
  if length(coalesce(p_code,'')) <> 5 or encode(digest(v.pin_salt || p_code, 'sha256'),'hex') <> v.pin_hash then
    update public.acs_admin_bootstrap set failed_attempts = failed_attempts + 1,
      locked_until = case when failed_attempts + 1 >= 5 then now() + interval '24 hours' else locked_until end
      where singleton = true;
    return false;
  end if;
  insert into public.acs_user_roles(user_id,role) values(auth.uid(),'admin') on conflict(user_id) do nothing;
  update public.acs_admin_bootstrap set consumed = true, pin_hash = '', pin_salt = '', failed_attempts = 0, locked_until = null where singleton = true;
  return true;
end; $$;
revoke all on function public.acs_claim_admin(text) from public, anon;
grant execute on function public.acs_claim_admin(text) to authenticated;

create or replace function public.acs_admin_update_player_stats(p_player_id uuid, p_stats jsonb)
returns void language plpgsql security definer set search_path = public, auth as $$
begin
  if not public.acs_is_admin() then raise exception 'Apenas administradores podem alterar estatísticas oficiais.'; end if;
  if not exists(select 1 from public.players where id = p_player_id) then raise exception 'Jogador não encontrado.'; end if;
  insert into public.player_competitive_stats(
    player_id,rating_am,kd,adr,headshot_pct,win_rate,matches,mvps,kills,deaths,first_kills,first_deaths,clutches,updated_at
  ) values (
    p_player_id,
    nullif(p_stats->>'rating_am','')::numeric,
    nullif(p_stats->>'kd','')::numeric,
    nullif(p_stats->>'adr','')::numeric,
    nullif(p_stats->>'headshot_pct','')::numeric,
    nullif(p_stats->>'win_rate','')::numeric,
    coalesce(nullif(p_stats->>'matches','')::integer,0),
    coalesce(nullif(p_stats->>'mvps','')::integer,0),
    coalesce(nullif(p_stats->>'kills','')::integer,0),
    coalesce(nullif(p_stats->>'deaths','')::integer,0),
    coalesce(nullif(p_stats->>'first_kills','')::integer,0),
    coalesce(nullif(p_stats->>'first_deaths','')::integer,0),
    coalesce(nullif(p_stats->>'clutches','')::integer,0),now()
  ) on conflict(player_id) do update set
    rating_am=excluded.rating_am,kd=excluded.kd,adr=excluded.adr,headshot_pct=excluded.headshot_pct,
    win_rate=excluded.win_rate,matches=excluded.matches,mvps=excluded.mvps,kills=excluded.kills,
    deaths=excluded.deaths,first_kills=excluded.first_kills,first_deaths=excluded.first_deaths,
    clutches=excluded.clutches,updated_at=now();
end; $$;
revoke all on function public.acs_admin_update_player_stats(uuid,jsonb) from public, anon;
grant execute on function public.acs_admin_update_player_stats(uuid,jsonb) to authenticated;

-- Capitão pode excluir a própria equipe; todos os integrantes voltam a Sem equipe.
create or replace function public.acs_delete_team(p_team_id uuid)
returns void language plpgsql security definer set search_path = public, auth as $$
declare v_name text;
begin
  select t.name into v_name
  from public.teams t
  join public.team_members tm on tm.team_id=t.id and tm.role='captain'
  join public.players p on p.id=tm.player_id
  where t.id=p_team_id and p.user_id=auth.uid()
  for update of t;
  if v_name is null then raise exception 'Somente o capitão pode excluir esta equipe.'; end if;
  update public.players set team_name='Sem equipe',updated_at=now()
    where id in (select player_id from public.team_members where team_id=p_team_id);
  delete from public.teams where id=p_team_id;
end; $$;
revoke all on function public.acs_delete_team(uuid) from public, anon;
grant execute on function public.acs_delete_team(uuid) to authenticated;

-- Atualiza o cache de esquema do PostgREST.
notify pgrst, 'reload schema';

-- Trilha de auditoria para alterações nas estatísticas oficiais.
create table if not exists public.acs_admin_audit_log (
  id bigint generated always as identity primary key,
  player_id uuid references public.players(id) on delete set null,
  admin_user_id uuid references auth.users(id) on delete set null,
  action text not null check (action in ('insert','update')),
  old_values jsonb,
  new_values jsonb,
  created_at timestamptz not null default now()
);
alter table public.acs_admin_audit_log enable row level security;
drop policy if exists "Admins can read audit log" on public.acs_admin_audit_log;
create policy "Admins can read audit log" on public.acs_admin_audit_log for select to authenticated using (public.acs_is_admin());
revoke all on public.acs_admin_audit_log from anon, authenticated;
grant select on public.acs_admin_audit_log to authenticated;
create index if not exists acs_admin_audit_player_idx on public.acs_admin_audit_log(player_id,created_at desc);

create or replace function public.acs_log_stats_change()
returns trigger language plpgsql security definer set search_path = public, auth as $$
begin
  insert into public.acs_admin_audit_log(player_id,admin_user_id,action,old_values,new_values)
  values (new.player_id,auth.uid(),lower(tg_op),case when tg_op='UPDATE' then to_jsonb(old) else null end,to_jsonb(new));
  return new;
end; $$;
drop trigger if exists trg_acs_log_stats_change on public.player_competitive_stats;
create trigger trg_acs_log_stats_change after insert or update on public.player_competitive_stats
for each row execute function public.acs_log_stats_change();
