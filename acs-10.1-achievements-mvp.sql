-- ACS 10.1 — MVP automático por partida e base para premiação do campeonato.
begin;
alter table public.matches
 add column if not exists mvp_player_id uuid references public.players(id) on delete set null,
 add column if not exists mvp_name_snapshot text,
 add column if not exists mvp_score numeric(10,3);
create index if not exists matches_tournament_completed_idx on public.matches(tournament_id,played_at desc) where status='completed' and tournament_id is not null;
create or replace function public.acs_recalculate_match_mvp(p_match_id uuid)
returns void language plpgsql security definer set search_path=pg_catalog,public as $function$
declare v_player_id uuid;v_name text;v_score numeric(10,3);
begin
 select s.player_id,coalesce(nullif(s.player_name_snapshot,''),p.nickname,'Jogador convidado'),
 round((greatest(0,coalesce(s.kills,0))*1.00+greatest(0,coalesce(s.assists,0))*.35+greatest(0,coalesce(s.adr,0))*.12+greatest(0,coalesce(s.headshot_pct,0))*.08+greatest(0,coalesce(s.clutches_won,0))*3.00+greatest(0,coalesce(s.first_kills,0))*1.50+greatest(0,coalesce(s.mvps,0))*.50-greatest(0,coalesce(s.first_deaths,0))*.75-greatest(0,coalesce(s.deaths,0))*.25)::numeric,3)
 into v_player_id,v_name,v_score
 from public.player_match_stats s left join public.players p on p.id=s.player_id
 where s.match_id=p_match_id
 order by (greatest(0,coalesce(s.kills,0))*1.00+greatest(0,coalesce(s.assists,0))*.35+greatest(0,coalesce(s.adr,0))*.12+greatest(0,coalesce(s.headshot_pct,0))*.08+greatest(0,coalesce(s.clutches_won,0))*3.00+greatest(0,coalesce(s.first_kills,0))*1.50+greatest(0,coalesce(s.mvps,0))*.50-greatest(0,coalesce(s.first_deaths,0))*.75-greatest(0,coalesce(s.deaths,0))*.25) desc,
 coalesce(s.kills,0) desc,coalesce(s.adr,0) desc,coalesce(s.assists,0) desc,coalesce(s.deaths,0) asc,coalesce(s.player_name_snapshot,'') asc
 limit 1;
 update public.matches set mvp_player_id=v_player_id,mvp_name_snapshot=v_name,mvp_score=v_score where id=p_match_id;
end;$function$;
revoke all on function public.acs_recalculate_match_mvp(uuid) from public,anon,authenticated;
create or replace function public.acs_match_mvp_deferred_trigger()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $function$
begin perform public.acs_recalculate_match_mvp(coalesce(NEW.match_id,OLD.match_id));return null;end;$function$;
revoke all on function public.acs_match_mvp_deferred_trigger() from public,anon,authenticated;
drop trigger if exists acs_player_match_mvp_deferred on public.player_match_stats;
create constraint trigger acs_player_match_mvp_deferred after insert or update on public.player_match_stats deferrable initially deferred for each row execute function public.acs_match_mvp_deferred_trigger();
do $$ declare r record;begin for r in select distinct match_id from public.player_match_stats loop perform public.acs_recalculate_match_mvp(r.match_id);end loop;end $$;
notify pgrst,'reload schema';
commit;