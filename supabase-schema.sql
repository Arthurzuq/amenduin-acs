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
