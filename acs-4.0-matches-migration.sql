-- ACS 4.0 — partidas oficiais e estatísticas por partida
-- Execute DEPOIS da migration ACS 3.3/3.3.1. Não substitui o schema original.

alter table public.matches add column if not exists best_of integer not null default 1 check (best_of in (1,3,5));
alter table public.matches add column if not exists notes text;
alter table public.player_match_stats add column if not exists team_side text check (team_side in ('A','B'));

create index if not exists idx_matches_status_date on public.matches(status, played_at desc);
create index if not exists idx_player_match_stats_player_match on public.player_match_stats(player_id, match_id);

-- RLS: partidas e estatísticas continuam públicas para leitura, sem escrita direta.
alter table public.matches enable row level security;
alter table public.player_match_stats enable row level security;
drop policy if exists "Public can view matches" on public.matches;
create policy "Public can view matches" on public.matches for select using (true);
drop policy if exists "Public can view match stats" on public.player_match_stats;
create policy "Public can view match stats" on public.player_match_stats for select using (true);
revoke insert, update, delete on public.matches from anon, authenticated;
revoke insert, update, delete on public.player_match_stats from anon, authenticated;
grant select on public.matches, public.player_match_stats to anon, authenticated;

create or replace function public.acs_recalculate_player_stats(p_player_id uuid)
returns void language plpgsql security definer set search_path = public, auth as $$
declare
  v_matches integer; v_kills integer; v_deaths integer; v_mvps integer;
  v_first_kills integer; v_first_deaths integer; v_clutches integer;
  v_kd numeric; v_adr numeric; v_hs numeric; v_win numeric; v_rating numeric;
begin
  select count(*), coalesce(sum(pms.kills),0), coalesce(sum(pms.deaths),0),
         coalesce(sum(pms.mvps),0), coalesce(sum(pms.first_kills),0),
         coalesce(sum(pms.first_deaths),0), coalesce(sum(pms.clutches_won),0),
         avg(pms.adr), avg(pms.headshot_pct)
    into v_matches,v_kills,v_deaths,v_mvps,v_first_kills,v_first_deaths,v_clutches,v_adr,v_hs
  from public.player_match_stats pms join public.matches m on m.id=pms.match_id
  where pms.player_id=p_player_id and m.status='completed';

  select case when count(*)=0 then 0 else
    100.0 * count(*) filter (where
      (pms.team_side='A' and m.team_a_score>m.team_b_score) or
      (pms.team_side='B' and m.team_b_score>m.team_a_score)) / count(*) end
  into v_win
  from public.player_match_stats pms join public.matches m on m.id=pms.match_id
  where pms.player_id=p_player_id and m.status='completed' and pms.team_side is not null;

  v_kd := case when v_deaths=0 then v_kills::numeric else v_kills::numeric/v_deaths end;
  -- Rating AM provisório, escala 0–100: K/D 35%, ADR 25%, HS 15%, win rate 20%, MVPs por partida 5%.
  -- ADR e K/D são normalizados e limitados para evitar que um único valor distorça a nota.
  v_rating := round((
    least(100,greatest(0,coalesce(v_kd,0)*50))*0.35 +
    least(100,greatest(0,coalesce(v_adr,0)/1.5))*0.25 +
    least(100,greatest(0,coalesce(v_hs,0)/0.6))*0.15 +
    least(100,greatest(0,coalesce(v_win,0)))*0.20 +
    least(100,greatest(0,case when v_matches=0 then 0 else v_mvps::numeric/v_matches*100 end))*0.05
  )::numeric,2);

  insert into public.player_competitive_stats
    (player_id,rating_am,kd,adr,headshot_pct,win_rate,matches,mvps,kills,deaths,first_kills,first_deaths,clutches,updated_at)
  values (p_player_id,v_rating,round(v_kd,3),round(v_adr,2),round(v_hs,2),round(v_win,2),v_matches,v_mvps,v_kills,v_deaths,v_first_kills,v_first_deaths,v_clutches,now())
  on conflict (player_id) do update set rating_am=excluded.rating_am,kd=excluded.kd,adr=excluded.adr,
    headshot_pct=excluded.headshot_pct,win_rate=excluded.win_rate,matches=excluded.matches,mvps=excluded.mvps,
    kills=excluded.kills,deaths=excluded.deaths,first_kills=excluded.first_kills,
    first_deaths=excluded.first_deaths,clutches=excluded.clutches,updated_at=now();
end; $$;
revoke all on function public.acs_recalculate_player_stats(uuid) from public, anon, authenticated;

create or replace function public.acs_admin_record_match(p_match jsonb, p_player_stats jsonb)
returns uuid language plpgsql security definer set search_path = public, auth as $$
declare
  v_match_id uuid; v_row jsonb; v_player_id uuid; v_seen uuid[] := '{}';
  v_a text; v_b text; v_score_a integer; v_score_b integer;
begin
  if not public.acs_is_admin() then raise exception 'Apenas administradores podem registrar partidas oficiais.'; end if;
  v_a := nullif(trim(p_match->>'team_a_name'),'');
  v_b := nullif(trim(p_match->>'team_b_name'),'');
  v_score_a := (p_match->>'team_a_score')::integer;
  v_score_b := (p_match->>'team_b_score')::integer;
  if v_a is null or v_b is null or lower(v_a)=lower(v_b) then raise exception 'Informe dois nomes de equipe diferentes.'; end if;
  if v_score_a is null or v_score_b is null or v_score_a < 0 or v_score_b < 0 or v_score_a=v_score_b then raise exception 'O placar precisa ter vencedor e não pode ser negativo.'; end if;
  if jsonb_typeof(p_player_stats) <> 'array' or jsonb_array_length(p_player_stats)<1 then raise exception 'Adicione as estatísticas de pelo menos um jogador.'; end if;

  insert into public.matches(tournament_id,played_at,map_name,team_a_name,team_b_name,team_a_score,team_b_score,status,best_of,notes)
  values (nullif(p_match->>'tournament_id','')::uuid,
    coalesce(nullif(p_match->>'played_at','')::timestamptz,now()),
    nullif(trim(p_match->>'map_name'),''),v_a,v_b,v_score_a,v_score_b,'completed',
    coalesce(nullif(p_match->>'best_of','')::integer,1),nullif(trim(p_match->>'notes'),''))
  returning id into v_match_id;

  for v_row in select value from jsonb_array_elements(p_player_stats) loop
    v_player_id := (v_row->>'player_id')::uuid;
    if v_player_id = any(v_seen) then raise exception 'Um jogador foi informado mais de uma vez.'; end if;
    v_seen := array_append(v_seen,v_player_id);
    if not exists(select 1 from public.players where id=v_player_id) then raise exception 'Jogador não encontrado.'; end if;
    if coalesce(v_row->>'team_side','') not in ('A','B') then raise exception 'Defina o lado A ou B para cada jogador.'; end if;
    insert into public.player_match_stats(match_id,player_id,team_side,kills,deaths,assists,adr,headshot_pct,mvps,first_kills,first_deaths,clutches_won)
    values(v_match_id,v_player_id,v_row->>'team_side',
      coalesce((v_row->>'kills')::integer,0),coalesce((v_row->>'deaths')::integer,0),coalesce((v_row->>'assists')::integer,0),
      nullif(v_row->>'adr','')::numeric,nullif(v_row->>'headshot_pct','')::numeric,
      coalesce((v_row->>'mvps')::integer,0),coalesce((v_row->>'first_kills')::integer,0),
      coalesce((v_row->>'first_deaths')::integer,0),coalesce((v_row->>'clutches_won')::integer,0));
  end loop;

  foreach v_player_id in array v_seen loop perform public.acs_recalculate_player_stats(v_player_id); end loop;
  return v_match_id;
end; $$;
revoke all on function public.acs_admin_record_match(jsonb,jsonb) from public, anon;
grant execute on function public.acs_admin_record_match(jsonb,jsonb) to authenticated;

create or replace function public.acs_admin_delete_match(p_match_id uuid)
returns boolean language plpgsql security definer set search_path = public, auth as $$
declare v_player_id uuid; v_ids uuid[];
begin
  if not public.acs_is_admin() then raise exception 'Apenas administradores podem excluir partidas.'; end if;
  select array_agg(player_id) into v_ids from public.player_match_stats where match_id=p_match_id;
  if not exists(select 1 from public.matches where id=p_match_id) then return false; end if;
  delete from public.matches where id=p_match_id;
  if v_ids is not null then foreach v_player_id in array v_ids loop perform public.acs_recalculate_player_stats(v_player_id); end loop; end if;
  return true;
end; $$;
revoke all on function public.acs_admin_delete_match(uuid) from public, anon;
grant execute on function public.acs_admin_delete_match(uuid) to authenticated;

notify pgrst, 'reload schema';
