-- ACS CS2 Dedicated Server Integration — base schema
alter table public.players
  add column if not exists steam_id64 text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.players'::regclass
      and conname = 'players_steam_id64_format_check'
  ) then
    alter table public.players
      add constraint players_steam_id64_format_check
      check (steam_id64 is null or steam_id64 ~ '^[0-9]{17}$');
  end if;
end $$;

create unique index if not exists players_steam_id64_unique
  on public.players (steam_id64)
  where steam_id64 is not null;

create table if not exists public.acs_cs2_match_reports (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  server_id text not null,
  external_match_id text not null,
  status text not null default 'pending'
    check (status in ('pending','approved','rejected')),
  schema_version integer not null default 1,
  payload jsonb not null,
  payload_sha256 text,
  received_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  review_note text,
  constraint acs_cs2_match_reports_match_unique unique (match_id),
  constraint acs_cs2_match_reports_external_unique unique (server_id, external_match_id),
  constraint acs_cs2_match_reports_payload_object check (jsonb_typeof(payload) = 'object')
);

create index if not exists acs_cs2_match_reports_status_received_idx
  on public.acs_cs2_match_reports (status, received_at desc);

alter table public.acs_cs2_match_reports enable row level security;
revoke all on public.acs_cs2_match_reports from anon, authenticated;
grant all on public.acs_cs2_match_reports to service_role;

comment on column public.players.steam_id64 is
  'SteamID64 verificado para vincular a conta ACS ao jogador dentro do servidor CS2.';
comment on table public.acs_cs2_match_reports is
  'Relatórios brutos recebidos do servidor ACS CS2; permanecem pendentes até validação administrativa.';
