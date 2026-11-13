-- ACS 10.2 — mantém apenas estatísticas que já são registradas nas partidas.
-- First kills, first deaths e clutches deixam de influenciar MVPs e não são mais solicitados pelo painel.

create or replace function public.acs_recalculate_match_mvp(p_match_id uuid)
returns void
language plpgsql
security definer
set search_path=pg_catalog,public
as $function$
declare
  v_player_id uuid;
  v_name text;
  v_score numeric(10,3);
begin
  select
    s.player_id,
    coalesce(nullif(s.player_name_snapshot,''),p.nickname,'Jogador convidado'),
    round((
      greatest(0,coalesce(s.kills,0))*1.00+
      greatest(0,coalesce(s.assists,0))*.35+
      greatest(0,coalesce(s.adr,0))*.12+
      greatest(0,coalesce(s.headshot_pct,0))*.08+
      greatest(0,coalesce(s.mvps,0))*.50-
      greatest(0,coalesce(s.deaths,0))*.25
    )::numeric,3)
  into v_player_id,v_name,v_score
  from public.player_match_stats s
  left join public.players p on p.id=s.player_id
  where s.match_id=p_match_id
  order by
    (
      greatest(0,coalesce(s.kills,0))*1.00+
      greatest(0,coalesce(s.assists,0))*.35+
      greatest(0,coalesce(s.adr,0))*.12+
      greatest(0,coalesce(s.headshot_pct,0))*.08+
      greatest(0,coalesce(s.mvps,0))*.50-
      greatest(0,coalesce(s.deaths,0))*.25
    ) desc,
    coalesce(s.kills,0) desc,
    coalesce(s.adr,0) desc,
    coalesce(s.assists,0) desc,
    coalesce(s.deaths,0) asc,
    coalesce(s.player_name_snapshot,'') asc
  limit 1;

  update public.matches
  set mvp_player_id=v_player_id,mvp_name_snapshot=v_name,mvp_score=v_score
  where id=p_match_id;
end;
$function$;

revoke all on function public.acs_recalculate_match_mvp(uuid) from public,anon,authenticated;

create or replace function public.acs_admin_update_player_stats(p_player_id uuid,p_stats jsonb)
returns void
language plpgsql
security definer
set search_path to 'public','auth'
as $function$
begin
  if not public.acs_is_admin() then
    raise exception 'Apenas administradores podem alterar estatísticas oficiais.';
  end if;
  if not exists(select 1 from public.players where id=p_player_id) then
    raise exception 'Jogador não encontrado.';
  end if;

  insert into public.player_competitive_stats(
    player_id,rating_am,kd,adr,headshot_pct,win_rate,matches,mvps,kills,deaths,updated_at
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
    now()
  )
  on conflict(player_id) do update set
    rating_am=excluded.rating_am,
    kd=excluded.kd,
    adr=excluded.adr,
    headshot_pct=excluded.headshot_pct,
    win_rate=excluded.win_rate,
    matches=excluded.matches,
    mvps=excluded.mvps,
    kills=excluded.kills,
    deaths=excluded.deaths,
    updated_at=now();
end;
$function$;


-- Também elimina referências a esses campos das rotinas de registro e agregação.
-- As colunas legadas permanecem no banco para compatibilidade; novas partidas usam seus defaults.

do $cleanup$
declare
  v_def text;
  v_new text;
begin
  select pg_get_functiondef('public.acs_admin_record_match(jsonb,jsonb)'::regprocedure) into v_def;
  v_new := replace(
    v_def,
    'kills,deaths,assists,adr,headshot_pct,mvps,first_kills,first_deaths,clutches_won',
    'kills,deaths,assists,adr,headshot_pct,mvps'
  );
  v_new := regexp_replace(
    v_new,
    $re$greatest\(0,coalesce\(nullif\(v_row->>'mvps',''\)::integer,0\)\),\s*greatest\(0,coalesce\(nullif\(v_row->>'first_kills',''\)::integer,0\)\),\s*greatest\(0,coalesce\(nullif\(v_row->>'first_deaths',''\)::integer,0\)\),\s*greatest\(0,coalesce\(nullif\(v_row->>'clutches_won',''\)::integer,0\)\)$re$,
    $replacement$greatest(0,coalesce(nullif(v_row->>'mvps','')::integer,0))$replacement$
  );
  if v_new=v_def or v_new ilike '%first_kills%' or v_new ilike '%clutches_won%' then
    raise exception 'Não foi possível limpar acs_admin_record_match com segurança.';
  end if;
  execute v_new;

  select pg_get_functiondef('public.acs_admin_record_series(jsonb,jsonb,jsonb)'::regprocedure) into v_def;
  v_new := replace(
    v_def,
    ',first_kills,first_deaths,clutches_won',
    ''
  );
  v_new := regexp_replace(
    v_new,
    $re$greatest\(0,coalesce\(\(v_row->>'mvps'\)::integer,0\)\),\s*0,0,0,v_player_name,v_is_guest$re$,
    $replacement$greatest(0,coalesce((v_row->>'mvps')::integer,0)),v_player_name,v_is_guest$replacement$
  );
  v_new := regexp_replace(
    v_new,
    $re$greatest\(0,coalesce\(\(v_map_stat->>'mvps'\)::integer,0\)\),\s*0,0,0,v_player_name,v_is_guest,v_team_side$re$,
    $replacement$greatest(0,coalesce((v_map_stat->>'mvps')::integer,0)),v_player_name,v_is_guest,v_team_side$replacement$
  );
  if v_new=v_def or v_new ilike '%first_kills%' or v_new ilike '%clutches_won%' then
    raise exception 'Não foi possível limpar acs_admin_record_series com segurança.';
  end if;
  execute v_new;
end;
$cleanup$;

create or replace function public.acs_recalculate_player_stats(p_player_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public','auth'
as $function$
declare
  v_matches integer;
  v_kills integer;
  v_deaths integer;
  v_mvps integer;
  v_kd numeric;
  v_adr numeric;
  v_hs numeric;
  v_win numeric;
  v_rating numeric;
begin
  select
    count(*),
    coalesce(sum(pms.kills),0),
    coalesce(sum(pms.deaths),0),
    coalesce(sum(pms.mvps),0),
    avg(pms.adr),
    avg(pms.headshot_pct)
  into v_matches,v_kills,v_deaths,v_mvps,v_adr,v_hs
  from public.player_match_stats pms
  join public.matches m on m.id=pms.match_id
  where pms.player_id=p_player_id and m.status='completed';

  select case when count(*)=0 then 0 else
    100.0*sum(case
      when pms.team_side='A' and m.team_a_score>m.team_b_score then 1.0
      when pms.team_side='B' and m.team_b_score>m.team_a_score then 1.0
      when m.team_a_score=m.team_b_score then 0.5 else 0.0
    end)/count(*) end
  into v_win
  from public.player_match_stats pms
  join public.matches m on m.id=pms.match_id
  where pms.player_id=p_player_id and m.status='completed' and pms.team_side is not null;

  v_kd:=case when v_deaths=0 then v_kills::numeric else v_kills::numeric/v_deaths end;
  v_rating:=round((
    least(100,greatest(0,coalesce(v_kd,0)*50))*0.35+
    least(100,greatest(0,coalesce(v_adr,0)/1.5))*0.25+
    least(100,greatest(0,coalesce(v_hs,0)/0.6))*0.15+
    least(100,greatest(0,coalesce(v_win,0)))*0.20+
    least(100,greatest(0,case when v_matches=0 then 0 else v_mvps::numeric/v_matches*100 end))*0.05
  )::numeric,2);

  insert into public.player_competitive_stats(
    player_id,rating_am,kd,adr,headshot_pct,win_rate,matches,mvps,kills,deaths,updated_at
  ) values(
    p_player_id,v_rating,round(v_kd,3),round(v_adr,2),round(v_hs,2),
    round(v_win,2),v_matches,v_mvps,v_kills,v_deaths,now()
  )
  on conflict(player_id) do update set
    rating_am=excluded.rating_am,
    kd=excluded.kd,
    adr=excluded.adr,
    headshot_pct=excluded.headshot_pct,
    win_rate=excluded.win_rate,
    matches=excluded.matches,
    mvps=excluded.mvps,
    kills=excluded.kills,
    deaths=excluded.deaths,
    updated_at=now();
end;
$function$;
