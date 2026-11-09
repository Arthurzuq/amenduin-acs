-- ACS 3.1 — equipes, elenco e convites entre jogadores
-- Execute UMA vez no Supabase SQL Editor, depois de aplicar as migrations anteriores.

alter table public.teams
  add column if not exists captain_player_id uuid references public.players(id) on delete set null,
  add column if not exists capacity integer not null default 5 check (capacity between 2 and 10);

create table if not exists public.team_members (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  player_id uuid not null unique references public.players(id) on delete cascade,
  role text not null default 'member' check (role in ('captain','member')),
  joined_at timestamptz not null default now()
);

create table if not exists public.team_invites (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  invited_player_id uuid not null references public.players(id) on delete cascade,
  invited_by_player_id uuid not null references public.players(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','rejected','cancelled')),
  created_at timestamptz not null default now(),
  decided_at timestamptz
);

create unique index if not exists team_invites_one_pending
  on public.team_invites(team_id, invited_player_id) where status = 'pending';
create index if not exists team_members_team_idx on public.team_members(team_id);
create index if not exists team_invites_player_idx on public.team_invites(invited_player_id, status);

alter table public.team_members enable row level security;
alter table public.team_invites enable row level security;

 drop policy if exists "Public can view team members" on public.team_members;
create policy "Public can view team members" on public.team_members for select using (true);
drop policy if exists "Public can view teams" on public.teams;
create policy "Public can view teams" on public.teams for select using (true);
drop policy if exists "Participants can view team invites" on public.team_invites;
create policy "Participants can view team invites" on public.team_invites for select to authenticated using (
  exists(select 1 from public.players p where p.id = invited_player_id and p.user_id = auth.uid())
  or exists(select 1 from public.players p where p.id = invited_by_player_id and p.user_id = auth.uid())
);

create or replace function public.acs_create_team(p_name text, p_tag text, p_capacity integer default 5)
returns uuid language plpgsql security definer set search_path = public, auth as $$
declare v_player public.players%rowtype; v_team_id uuid;
begin
  if auth.uid() is null then raise exception 'Entre na sua conta para criar uma equipe.'; end if;
  select * into v_player from public.players where user_id = auth.uid() for update;
  if not found then raise exception 'Crie seu perfil de jogador antes de criar uma equipe.'; end if;
  if exists(select 1 from public.team_members where player_id = v_player.id) then raise exception 'Você já faz parte de uma equipe.'; end if;
  if length(trim(coalesce(p_name,''))) < 3 then raise exception 'O nome da equipe precisa ter ao menos 3 caracteres.'; end if;
  if p_capacity < 2 or p_capacity > 10 then raise exception 'A equipe deve ter entre 2 e 10 vagas.'; end if;
  insert into public.teams(name, tag, captain_player_id, capacity) values(trim(p_name), nullif(trim(p_tag),''), v_player.id, p_capacity) returning id into v_team_id;
  insert into public.team_members(team_id, player_id, role) values(v_team_id, v_player.id, 'captain');
  update public.players set team_name = trim(p_name), updated_at = now() where id = v_player.id;
  return v_team_id;
end; $$;

create or replace function public.acs_invite_player(p_team_id uuid, p_player_id uuid)
returns uuid language plpgsql security definer set search_path = public, auth as $$
declare v_captain uuid; v_capacity integer; v_count integer; v_invite uuid;
begin
  select tm.player_id, t.capacity into v_captain, v_capacity
  from public.team_members tm join public.teams t on t.id = tm.team_id
  join public.players p on p.id = tm.player_id
  where tm.team_id = p_team_id and tm.role = 'captain' and p.user_id = auth.uid();
  if v_captain is null then raise exception 'Somente o capitão pode convidar jogadores.'; end if;
  if p_player_id = v_captain then raise exception 'Você já é o capitão desta equipe.'; end if;
  if exists(select 1 from public.team_members where player_id = p_player_id) then raise exception 'Este jogador já faz parte de uma equipe.'; end if;
  select count(*) into v_count from public.team_members where team_id = p_team_id;
  if v_count >= v_capacity then raise exception 'A equipe já atingiu o limite de jogadores.'; end if;
  insert into public.team_invites(team_id, invited_player_id, invited_by_player_id)
  values(p_team_id, p_player_id, v_captain) returning id into v_invite;
  return v_invite;
end; $$;

create or replace function public.acs_respond_team_invite(p_invite_id uuid, p_accept boolean)
returns void language plpgsql security definer set search_path = public, auth as $$
declare v_invite public.team_invites%rowtype; v_player public.players%rowtype; v_team public.teams%rowtype; v_count integer;
begin
  select * into v_invite from public.team_invites where id = p_invite_id for update;
  if not found or v_invite.status <> 'pending' then raise exception 'Este convite não está mais disponível.'; end if;
  select * into v_player from public.players where id = v_invite.invited_player_id and user_id = auth.uid() for update;
  if not found then raise exception 'Este convite não pertence à sua conta.'; end if;
  if p_accept then
    if exists(select 1 from public.team_members where player_id = v_player.id) then raise exception 'Você já faz parte de uma equipe.'; end if;
    select * into v_team from public.teams where id = v_invite.team_id for update;
    select count(*) into v_count from public.team_members where team_id = v_team.id;
    if v_count >= v_team.capacity then raise exception 'A equipe não possui mais vagas.'; end if;
    insert into public.team_members(team_id, player_id, role) values(v_team.id, v_player.id, 'member');
    update public.players set team_name = v_team.name, updated_at = now() where id = v_player.id;
    update public.team_invites set status = 'accepted', decided_at = now() where id = p_invite_id;
    update public.team_invites set status = 'cancelled', decided_at = now() where invited_player_id = v_player.id and status = 'pending' and id <> p_invite_id;
  else
    update public.team_invites set status = 'rejected', decided_at = now() where id = p_invite_id;
  end if;
end; $$;

create or replace function public.acs_remove_team_member(p_player_id uuid)
returns void language plpgsql security definer set search_path = public, auth as $$
declare v_team_id uuid; v_team_name text;
begin
  select tm.team_id, t.name into v_team_id, v_team_name
  from public.team_members tm join public.teams t on t.id = tm.team_id
  join public.team_members captain on captain.team_id = tm.team_id and captain.role = 'captain'
  join public.players cp on cp.id = captain.player_id
  where tm.player_id = p_player_id and tm.role = 'member' and cp.user_id = auth.uid();
  if v_team_id is null then raise exception 'Somente o capitão pode remover integrantes; o capitão não pode ser removido.'; end if;
  delete from public.team_members where team_id = v_team_id and player_id = p_player_id;
  update public.players set team_name = 'Sem equipe', updated_at = now() where id = p_player_id;
end; $$;

revoke all on function public.acs_create_team(text,text,integer) from public, anon;
revoke all on function public.acs_invite_player(uuid,uuid) from public, anon;
revoke all on function public.acs_respond_team_invite(uuid,boolean) from public, anon;
revoke all on function public.acs_remove_team_member(uuid) from public, anon;
grant execute on function public.acs_create_team(text,text,integer) to authenticated;
grant execute on function public.acs_invite_player(uuid,uuid) to authenticated;
grant execute on function public.acs_respond_team_invite(uuid,boolean) to authenticated;
grant execute on function public.acs_remove_team_member(uuid) to authenticated;
