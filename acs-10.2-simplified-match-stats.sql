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
