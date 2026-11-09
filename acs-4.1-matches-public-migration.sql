-- ACS 4.1 — área pública de partidas + reparo do registro oficial
-- Execute no Supabase SQL Editor. Migration incremental e reaplicável.

alter table public.matches add column if not exists best_of integer not null default 1;
alter table public.matches add column if not exists notes text;
alter table public.player_match_stats add column if not exists team_side text;
alter table public.player_match_stats add column if not exists assists integer not null default 0;
alter table public.player_match_stats add column if not exists adr numeric(7,2);
alter table public.player_match_stats add column if not exists headshot_pct numeric(5,2);
alter table public.player_match_stats add column if not exists mvps integer not null default 0;
alter table public.player_match_stats add column if not exists first_kills integer not null default 0;
alter table public.player_match_stats add column if not exists first_deaths integer not null default 0;
alter table public.player_match_stats add column if not exists clutches_won integer not null default 0;

alter table public.matches enable row level security;
alter table public.player_match_stats enable row level security;
drop policy if exists \"Public can view matches\" on public.matches;
create policy \"Public can view matches\" on public.matches for select using (true);
drop policy if exists \"Public can view match stats\" on public.player_match_stats;
create policy \"Public can view match stats\" on public.player_match_stats for select using (true);
grant select on public.matches, public.player_match_stats to anon, authenticated;
revoke insert, update, delete on public.matches, public.player_match_stats from anon, authenticated;

create or replace function public.acs_admin_record_match(p_match jsonb, p_player_stats jsonb)
returns uuid language plpgsql security definer set search_path = public, auth as $$
declare
  v_match_id uuid; v_row jsonb; v_player_id uuid; v_seen uuid[] := '{}';
  v_a text; v_b text; v_score_a integer; v_score_b integer;
begin
  if auth.uid() is null or not public.acs_is_admin() then
    raise exception 'Apenas administradores autenticados podem registrar partidas.';
  end if;
  if p_match is null or jsonb_typeof(p_match) <> 'object' then raise exception 'Dados da partida inválidos.'; end if;
  v_a := nullif(trim(p_match->>'team_a_name'),'');
  v_b := nullif(trim(p_match->>'team_b_name'),'');
  v_score_a := nullif(p_match->>'team_a_score','')::integer;
  v_score_b := nullif(p_match->>'team_b_score','')::integer;
  if v_a is null or v_b is null or lower(v_a)=lower(v_b) then raise exception 'Informe dois nomes de equipe diferentes.'; end if;
  if v_score_a is null or v_score_b is null or v_score_a < 0 or v_score_b < 0 or v_score_a=v_score_b then raise exception 'O placar precisa ter vencedor e não pode ser negativo.'; end if;
  if jsonb_typeof(p_player_stats) <> 'array' or jsonb_array_length(p_player_stats)<1 then raise exception 'Adicione pelo menos um jogador participante.'; end if;
  insert into public.matches(tournament_id,played_at,map_name,team_a_name,team_b_name,team_a_score,team_b_score,status,best_of,notes)
  values (nullif(p_match->>'tournament_id','')::uuid, coalesce(nullif(p_match->>'played_at','')::timestamptz,now()),
    nullif(trim(p_match->>'map_name'),''),v_a,v_b,v_score_a,v_score_b,'completed',
    coalesce(nullif(p_match->>'best_of','')::integer,1),nullif(trim(p_match->>'notes'),''))
  returning id into v_match_id;
  for v_row in select value from jsonb_array_elements(p_player_stats) loop
    v_player_id := nullif(v_row->>'player_id','')::uuid;
    if v_player_id is null then raise exception 'Um participante está sem jogador selecionado.'; end if;
    if v_player_id = any(v_seen) then raise exception 'Um jogador foi informado mais de uma vez.'; end if;
    v_seen := array_append(v_seen,v_player_id);
    if not exists(select 1 from public.players where id=v_player_id) then raise exception 'Jogador não encontrado: %',v_player_id; end if;
    if coalesce(v_row->>'team_side','') not in ('A','B') then raise exception 'Defina o lado A ou B para cada participante.'; end if;
    insert into public.player_match_stats(match_id,player_id,team_side,kills,deaths,assists,adr,headshot_pct,mvps,first_kills,first_deaths,clutches_won)
    values(v_match_id,v_player_id,v_row->>'team_side',
      greatest(0,coalesce(nullif(v_row->>'kills','')::integer,0)),greatest(0,coalesce(nullif(v_row->>'deaths','')::integer,0)),
      greatest(0,coalesce(nullif(v_row->>'assists','')::integer,0)),nullif(v_row->>'adr','')::numeric,
      nullif(v_row->>'headshot_pct','')::numeric,greatest(0,coalesce(nullif(v_row->>'mvps','')::integer,0)),
      greatest(0,coalesce(nullif(v_row->>'first_kills','')::integer,0)),greatest(0,coalesce(nullif(v_row->>'first_deaths','')::integer,0)),
      greatest(0,coalesce(nullif(v_row->>'clutches_won','')::integer,0)));
  end loop;
  foreach v_player_id in array v_seen loop perform public.acs_recalculate_player_stats(v_player_id); end loop;
  return v_match_id;
end; $$;
revoke all on function public.acs_admin_record_match(jsonb,jsonb) from public, anon;
grant execute on function public.acs_admin_record_match(jsonb,jsonb) to authenticated;

notify pgrst, 'reload schema';
