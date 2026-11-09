-- AMENDUIN COMPETITIVE SYSTEM (ACS)
-- Execute in Supabase SQL Editor.
-- Review policies before production. Admin/organizer provisioning should be done
-- through trusted server-side tooling, never by allowing users to self-assign roles.

create extension if not exists pgcrypto;

create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users(id) on delete set null,
  nickname text not null unique,
  steam_url text,
  country text not null default 'Brasil',
  main_role text not null check (main_role in ('AWPer','Rifler','Support','Lurker','Entry-Fragger','IGL')),
  secondary_role text check (secondary_role is null or secondary_role in ('AWPer','Rifler','Support','Lurker','Entry-Fragger','IGL')),
  team_name text not null default 'Sem equipe',
  market_status text not null default 'Disponível' check (market_status in ('Disponível','Negociável','Intocável','Livre','Em negociação')),
  bio varchar(240),
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  tag text unique,
  created_at timestamptz not null default now()
);

create table if not exists public.seasons (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  starts_on date,
  ends_on date,
  status text not null default 'planned' check (status in ('planned','active','completed')),
  created_at timestamptz not null default now()
);

create table if not exists public.tournaments (
  id uuid primary key default gen_random_uuid(),
  season_id uuid references public.seasons(id) on delete set null,
  name text not null,
  status text not null default 'planned' check (status in ('planned','active','completed')),
  created_at timestamptz not null default now()
);

create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid references public.tournaments(id) on delete set null,
  played_at timestamptz,
  map_name text,
  team_a_name text,
  team_b_name text,
  team_a_score integer,
  team_b_score integer,
  status text not null default 'scheduled' check (status in ('scheduled','completed','cancelled')),
  created_at timestamptz not null default now()
);

create table if not exists public.player_match_stats (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  kills integer not null default 0 check (kills >= 0),
  deaths integer not null default 0 check (deaths >= 0),
  assists integer not null default 0 check (assists >= 0),
  adr numeric(6,2),
  headshot_pct numeric(5,2),
  mvps integer not null default 0 check (mvps >= 0),
  first_kills integer not null default 0 check (first_kills >= 0),
  first_deaths integer not null default 0 check (first_deaths >= 0),
  clutches_won integer not null default 0 check (clutches_won >= 0),
  unique(match_id, player_id)
);

create table if not exists public.player_evaluations (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  tournament_id uuid references public.tournaments(id) on delete set null,
  rating_am numeric(5,2) check (rating_am between 0 and 100),
  role_score numeric(5,2) check (role_score between 0 and 100),
  notes text,
  evaluated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.transfers (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  from_team text,
  to_team text,
  status text not null default 'pending' check (status in ('pending','accepted','rejected','cancelled')),
  proposed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  decided_at timestamptz
);

-- Profile ownership is established by auth.users.id = players.user_id.
alter table public.players enable row level security;
alter table public.teams enable row level security;
alter table public.seasons enable row level security;
alter table public.tournaments enable row level security;
alter table public.matches enable row level security;
alter table public.player_match_stats enable row level security;
alter table public.player_evaluations enable row level security;
alter table public.transfers enable row level security;

-- Public read access for league profile and competition data.
create policy "Public can view players" on public.players for select using (true);
create policy "Users can create their own player profile" on public.players
  for insert to authenticated with check (auth.uid() = user_id);
create policy "Users can update their own player profile" on public.players
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Public can view teams" on public.teams for select using (true);
create policy "Public can view seasons" on public.seasons for select using (true);
create policy "Public can view tournaments" on public.tournaments for select using (true);
create policy "Public can view matches" on public.matches for select using (true);
create policy "Public can view match stats" on public.player_match_stats for select using (true);
create policy "Public can view evaluations" on public.player_evaluations for select using (true);
create policy "Public can view transfers" on public.transfers for select using (true);

-- Deliberately no client-side write policies for official stats, evaluations,
-- teams, matches or transfer decisions. Those actions require a trusted admin API
-- or carefully provisioned admin/organizer roles in a later implementation.

create index if not exists idx_players_nickname on public.players(nickname);
create index if not exists idx_player_stats_player on public.player_match_stats(player_id);
create index if not exists idx_player_stats_match on public.player_match_stats(match_id);
create index if not exists idx_matches_played_at on public.matches(played_at desc);

-- ACS 3.0: player-to-player transfer proposals.
-- Run this section in the Supabase SQL Editor after the original schema.
create table if not exists public.transfer_offers (
  id uuid primary key default gen_random_uuid(),
  target_player_id uuid not null references public.players(id) on delete cascade,
  offered_by_player_id uuid not null references public.players(id) on delete cascade,
  message varchar(500),
  status text not null default 'pending' check (status in ('pending','accepted','rejected','cancelled')),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  constraint transfer_offer_distinct_players check (target_player_id <> offered_by_player_id)
);

alter table public.transfer_offers enable row level security;
drop policy if exists "Participants can view their transfer offers" on public.transfer_offers;
create policy "Participants can view their transfer offers" on public.transfer_offers
  for select to authenticated using (
    exists (select 1 from public.players p where p.id = target_player_id and p.user_id = auth.uid())
    or exists (select 1 from public.players p where p.id = offered_by_player_id and p.user_id = auth.uid())
  );
drop policy if exists "Players can send transfer offers" on public.transfer_offers;
create policy "Players can send transfer offers" on public.transfer_offers
  for insert to authenticated with check (
    exists (select 1 from public.players p where p.id = offered_by_player_id and p.user_id = auth.uid())
    and exists (
      select 1 from public.players p
      where p.id = target_player_id
        and p.market_status in ('Disponível','Negociável','Livre','Em negociação')
    )
    and target_player_id <> offered_by_player_id
    and status = 'pending'
  );
drop policy if exists "Participants can update transfer offers" on public.transfer_offers;
create policy "Participants can update transfer offers" on public.transfer_offers
  for update to authenticated using (
    exists (select 1 from public.players p where p.id = target_player_id and p.user_id = auth.uid())
    or exists (select 1 from public.players p where p.id = offered_by_player_id and p.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.players p where p.id = target_player_id and p.user_id = auth.uid())
    or (status = 'cancelled' and exists (select 1 from public.players p where p.id = offered_by_player_id and p.user_id = auth.uid()))
  );

create or replace function public.guard_transfer_offer_update()
returns trigger language plpgsql security definer set search_path = public, auth as $$
declare
  target_owner uuid;
  proposer_owner uuid;
begin
  select user_id into target_owner from public.players where id = old.target_player_id;
  select user_id into proposer_owner from public.players where id = old.offered_by_player_id;
  if new.target_player_id <> old.target_player_id
     or new.offered_by_player_id <> old.offered_by_player_id
     or new.message is distinct from old.message
     or old.status <> 'pending'
     or new.status not in ('accepted','rejected','cancelled') then
    raise exception 'Esta proposta não pode ser alterada dessa forma.';
  end if;
  if auth.uid() = target_owner then
    if new.status not in ('accepted','rejected') then
      raise exception 'O destinatário só pode aceitar ou recusar a proposta.';
    end if;
  elsif auth.uid() = proposer_owner then
    if new.status <> 'cancelled' then
      raise exception 'O autor só pode cancelar a própria proposta.';
    end if;
  else
    raise exception 'Você não participa desta proposta.';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_guard_transfer_offer_update on public.transfer_offers;
create trigger trg_guard_transfer_offer_update before update on public.transfer_offers
  for each row execute function public.guard_transfer_offer_update();

create or replace function public.apply_accepted_transfer_offer()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  new_team text;
  old_team text;
  proposer_user uuid;
begin
  if old.status = 'pending' and new.status = 'accepted' then
    select team_name, user_id into new_team, proposer_user
      from public.players where id = new.offered_by_player_id;
    select team_name into old_team from public.players where id = new.target_player_id;
    if new_team is not null and new_team <> '' and new_team <> 'Sem equipe' then
      update public.players set team_name = new_team, market_status = 'Intocável', updated_at = now()
        where id = new.target_player_id;
      insert into public.transfers(player_id, from_team, to_team, status, proposed_by, decided_at)
        values (new.target_player_id, old_team, new_team, 'accepted', proposer_user, now());
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_apply_accepted_transfer_offer on public.transfer_offers;
create trigger trg_apply_accepted_transfer_offer after update on public.transfer_offers
  for each row execute function public.apply_accepted_transfer_offer();

create index if not exists idx_transfer_offers_target on public.transfer_offers(target_player_id, created_at desc);
create index if not exists idx_transfer_offers_proposer on public.transfer_offers(offered_by_player_id, created_at desc);

create unique index if not exists idx_transfer_offers_one_pending_pair
  on public.transfer_offers(target_player_id, offered_by_player_id) where status = 'pending';
