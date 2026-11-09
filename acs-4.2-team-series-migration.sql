-- ACS 4.2 — equipes públicas, séries MD1/MD2/MD3, placares por lado e rankings de equipes
-- Execute DEPOIS das migrations ACS 3.1, 3.3/3.3.1 e 4.1.

-- Corrige leitura pública das equipes e elencos (sem liberar escrita direta).
alter table public.teams enable row level security;
alter table public.team_members enable row level security;
drop policy if exists "Public can view teams" on public.teams;
create policy "Public can view teams" on public.teams for select using (true);
drop policy if exists "Public can view team members" on public.team_members;
create policy "Public can view team members" on public.team_members for select using (true);
grant select on public.teams, public.team_members to anon, authenticated;

alter table public.matches add column if not exists team_a_id uuid references public.teams(id) on delete set null;
alter table public.matches add column if not exists team_b_id uuid references public.teams(id) on delete set null;
-- A migration 4.0 anterior permitia somente 1, 3 e 5. MD2 também precisa ser aceito.
do $$ declare c record; begin
 for c in select conname from pg_constraint where conrelid='public.matches'::regclass and contype='c' and pg_get_constraintdef(oid) ilike '%best_of%'
 loop execute format('alter table public.matches drop constraint %I',c.conname); end loop;
end $$;
alter table public.matches add constraint matches_best_of_check check(best_of in (1,2,3,5));

create table if not exists public.match_maps (
 id uuid primary key default gen_random_uuid(),
 match_id uuid not null references public.matches(id) on delete cascade,
 map_number integer not null check(map_number between 1 and 3),
 map_name text not null,
 team_a_start_side text not null check(team_a_start_side in ('TR','CT')),
 a_first_half integer not null check(a_first_half between 0 and 12),
 b_first_half integer not null check(b_first_half between 0 and 12),
 a_second_half integer not null check(a_second_half between 0 and 12),
 b_second_half integer not null check(b_second_half between 0 and 12),
 a_ot_tr integer not null default 0 check(a_ot_tr >= 0),
 a_ot_ct integer not null default 0 check(a_ot_ct >= 0),
 b_ot_tr integer not null default 0 check(b_ot_tr >= 0),
 b_ot_ct integer not null default 0 check(b_ot_ct >= 0),
 team_a_score integer not null,
 team_b_score integer not null,
 created_at timestamptz not null default now(),
 unique(match_id,map_number)
);
create index if not exists idx_match_maps_match on public.match_maps(match_id,map_number);
alter table public.match_maps enable row level security;
drop policy if exists "Public can view match maps" on public.match_maps;
create policy "Public can view match maps" on public.match_maps for select using(true);
grant select on public.match_maps to anon, authenticated;
revoke insert,update,delete on public.match_maps from anon,authenticated;

-- Estatísticas de lado do jogador: cada participante recebe os rounds do lado
-- jogados pela sua equipe em cada mapa (métrica de desempenho coletivo no lado).
create table if not exists public.player_side_round_stats (
 id bigint generated always as identity primary key,
 player_id uuid not null references public.players(id) on delete cascade,
 match_id uuid not null references public.matches(id) on delete cascade,
 map_number integer not null,
 side text not null check(side in ('TR','CT')),
 rounds_won integer not null,
 rounds_played integer not null,
 unique(player_id,match_id,map_number,side)
);
alter table public.player_side_round_stats enable row level security;
drop policy if exists "Public can view player side stats" on public.player_side_round_stats;
create policy "Public can view player side stats" on public.player_side_round_stats for select using(true);
grant select on public.player_side_round_stats to anon,authenticated;
revoke insert,update,delete on public.player_side_round_stats from anon,authenticated;

create or replace view public.acs_team_rankings as
with results as (
 select m.team_a_id team_id, (m.team_a_score>m.team_b_score) won,
        m.team_a_score scored,m.team_b_score conceded, m.id match_id
 from public.matches m where m.status='completed' and m.team_a_id is not null
 union all
 select m.team_b_id, (m.team_b_score>m.team_a_score),m.team_b_score,m.team_a_score,m.id
 from public.matches m where m.status='completed' and m.team_b_id is not null
), agg as (
 select team_id,count(*) matches,count(*) filter(where won) wins,
        count(*) filter(where not won and scored<>conceded) losses,
        count(*) filter(where scored=conceded) draws,avg(scored-conceded) map_diff,
        avg(case when won then 100.0 when scored=conceded then 50.0 else 0.0 end) win_rate
 from results group by team_id
)
select t.id team_id,t.name,t.tag,coalesce(a.matches,0)::integer matches,
 coalesce(a.wins,0)::integer wins,coalesce(a.losses,0)::integer losses,coalesce(a.draws,0)::integer draws,
 round(coalesce(a.win_rate,0),2) win_rate,round(coalesce(a.map_diff,0),2) map_diff,
 round((coalesce(a.win_rate,0)*0.75 + greatest(0,least(100,50+coalesce(a.map_diff,0)*2))*0.25)::numeric,2) rating_am
from public.teams t left join agg a on a.team_id=t.id;
grant select on public.acs_team_rankings to anon,authenticated;

create or replace view public.acs_team_map_stats as
with team_maps as (
 select m.team_a_id team_id, mm.map_name,
        (mm.team_a_score>mm.team_b_score) won,mm.team_a_score scored,mm.team_b_score conceded
 from public.matches m join public.match_maps mm on mm.match_id=m.id
 where m.status='completed' and m.team_a_id is not null
 union all
 select m.team_b_id,mm.map_name,(mm.team_b_score>mm.team_a_score),mm.team_b_score,mm.team_a_score
 from public.matches m join public.match_maps mm on mm.match_id=m.id
 where m.status='completed' and m.team_b_id is not null
)
select team_id,map_name,count(*)::integer matches,count(*) filter(where won)::integer wins,
 round(100.0*count(*) filter(where won)/nullif(count(*),0),2) win_rate,
 round(avg(scored-conceded),2) round_diff
from team_maps group by team_id,map_name;
grant select on public.acs_team_map_stats to anon,authenticated;

create or replace function public.acs_admin_record_series(p_match jsonb,p_maps jsonb,p_player_stats jsonb)
returns uuid language plpgsql security definer set search_path=public,auth as $$
declare
 v_id uuid; v_a uuid; v_b uuid; v_name_a text; v_name_b text; v_bo integer;
 v_map jsonb; v_row jsonb; v_no integer:=0; v_wins_a integer:=0; v_wins_b integer:=0;
 v_a1 integer;v_b1 integer;v_a2 integer;v_b2 integer;v_atr integer;v_act integer;v_btr integer;v_bct integer;
 v_ascore integer;v_bscore integer;v_atrwon integer;v_actwon integer;v_btrwon integer;v_bctwon integer;
 v_a_tr integer;v_a_ct integer;v_b_tr integer;v_b_ct integer;v_player uuid;v_seen uuid[]:='{}';v_team_side text;
begin
 if auth.uid() is null or not public.acs_is_admin() then raise exception 'Apenas administradores podem registrar séries.'; end if;
 v_a:=nullif(p_match->>'team_a_id','')::uuid; v_b:=nullif(p_match->>'team_b_id','')::uuid;
 if v_a is null or v_b is null or v_a=v_b then raise exception 'Selecione duas equipes diferentes.'; end if;
 select name into v_name_a from public.teams where id=v_a;
 select name into v_name_b from public.teams where id=v_b;
 if v_name_a is null or v_name_b is null then raise exception 'Equipe não encontrada.'; end if;
 v_bo:=coalesce((p_match->>'best_of')::integer,1);
 if v_bo not in(1,2,3) then raise exception 'Formato inválido. Use MD1, MD2 ou MD3.'; end if;
 if jsonb_typeof(p_maps)<>'array' or (v_bo=1 and jsonb_array_length(p_maps)<>1) or (v_bo=2 and jsonb_array_length(p_maps)<>2) or (v_bo=3 and jsonb_array_length(p_maps) not between 2 and 3) then raise exception 'Quantidade de mapas inválida para o formato selecionado.'; end if;
 if jsonb_typeof(p_player_stats)<>'array' or jsonb_array_length(p_player_stats)<1 then raise exception 'Selecione ao menos um jogador participante.'; end if;
 -- Valida e calcula a série antes de persistir.
 for v_map in select value from jsonb_array_elements(p_maps) loop
  v_no:=v_no+1;
  if nullif(trim(v_map->>'map_name'),'') is null then raise exception 'Selecione o mapa %.',v_no; end if;
  if coalesce(v_map->>'team_a_start_side','') not in('TR','CT') then raise exception 'Defina o lado inicial da equipe A no mapa %.',v_no; end if;
  v_a1:=(v_map->>'a_first_half')::integer;v_b1:=(v_map->>'b_first_half')::integer;
  v_a2:=(v_map->>'a_second_half')::integer;v_b2:=(v_map->>'b_second_half')::integer;
  if least(v_a1,v_b1,v_a2,v_b2)<0 or greatest(v_a1,v_b1,v_a2,v_b2)>12 or v_a1+v_b1<>12 or v_a2+v_b2>12 then raise exception 'Mapa %: o primeiro tempo deve somar 12 rounds e o segundo não pode ultrapassar 12.',v_no; end if;
  if greatest(v_a1+v_a2,v_b1+v_b2)<13 and not (v_a1+v_a2=12 and v_b1+v_b2=12) then raise exception 'Mapa %: placar regulamentar inválido; o mapa deve terminar em 13 rounds ou 12–12.',v_no; end if;
  v_atr:=coalesce((v_map->>'a_ot_tr')::integer,0);v_act:=coalesce((v_map->>'a_ot_ct')::integer,0);
  v_btr:=coalesce((v_map->>'b_ot_tr')::integer,0);v_bct:=coalesce((v_map->>'b_ot_ct')::integer,0);
  if v_atr+v_act+v_btr+v_bct>0 and v_atr+v_act+v_btr+v_bct<6 then raise exception 'Mapa %: a prorrogação deve registrar pelo menos 6 rounds.',v_no; end if;
  v_ascore:=v_a1+v_a2+v_atr+v_act;v_bscore:=v_b1+v_b2+v_btr+v_bct;
  if v_a1+v_a2=12 and v_b1+v_b2=12 then
    if v_atr+v_act+v_btr+v_bct=0 or v_ascore=v_bscore then raise exception 'Mapa %: empate 12–12 exige prorrogação completa até haver vencedor.',v_no; end if;
    if mod(v_atr+v_act+v_btr+v_bct,6)<>0 then raise exception 'Mapa %: a prorrogação MR3 deve ser registrada em blocos de 6 rounds.',v_no; end if;
  elsif v_atr+v_act+v_btr+v_bct>0 then raise exception 'Mapa %: só registre prorrogação quando o tempo regulamentar terminar 12–12.',v_no;
  end if;
  if v_ascore=v_bscore then raise exception 'Mapa % ainda está empatado.',v_no; end if;
  if v_ascore>v_bscore then v_wins_a:=v_wins_a+1;else v_wins_b:=v_wins_b+1;end if;
 end loop;
 if v_wins_a=v_wins_b and v_bo<>2 then raise exception 'A série precisa ter um vencedor; empate de séries só é permitido em MD2.'; end if;
 if v_bo=1 and (v_wins_a+v_wins_b)<>1 then raise exception 'MD1 deve conter um mapa.'; end if;
 if v_bo=3 and greatest(v_wins_a,v_wins_b)<2 then raise exception 'A série MD3 precisa de duas vitórias em mapas.'; end if;
 if v_bo=3 and jsonb_array_length(p_maps)=3 and greatest(v_wins_a,v_wins_b)=3 then raise exception 'Uma série MD3 termina assim que uma equipe vence dois mapas; não registre um terceiro mapa após um 2–0.'; end if;
 -- O placar legado representa o resultado da série (mapas vencidos), mantendo compatibilidade.
 insert into public.matches(tournament_id,played_at,map_name,team_a_name,team_b_name,team_a_score,team_b_score,status,best_of,notes,team_a_id,team_b_id)
 values(nullif(p_match->>'tournament_id','')::uuid,coalesce(nullif(p_match->>'played_at','')::timestamptz,now()),
 'Série MD'||v_bo,v_name_a,v_name_b,v_wins_a,v_wins_b,'completed',v_bo,nullif(trim(p_match->>'notes'),''),v_a,v_b)
 returning id into v_id;
 v_no:=0;
 for v_map in select value from jsonb_array_elements(p_maps) loop
  v_no:=v_no+1;v_a1:=(v_map->>'a_first_half')::integer;v_b1:=(v_map->>'b_first_half')::integer;
  v_a2:=(v_map->>'a_second_half')::integer;v_b2:=(v_map->>'b_second_half')::integer;
  v_atr:=coalesce((v_map->>'a_ot_tr')::integer,0);v_act:=coalesce((v_map->>'a_ot_ct')::integer,0);v_btr:=coalesce((v_map->>'b_ot_tr')::integer,0);v_bct:=coalesce((v_map->>'b_ot_ct')::integer,0);
  v_ascore:=v_a1+v_a2+v_atr+v_act;v_bscore:=v_b1+v_b2+v_btr+v_bct;
  insert into public.match_maps(match_id,map_number,map_name,team_a_start_side,a_first_half,b_first_half,a_second_half,b_second_half,a_ot_tr,a_ot_ct,b_ot_tr,b_ot_ct,team_a_score,team_b_score)
  values(v_id,v_no,trim(v_map->>'map_name'),v_map->>'team_a_start_side',v_a1,v_b1,v_a2,v_b2,v_atr,v_act,v_btr,v_bct,v_ascore,v_bscore);
  -- Converte rounds ganhos por equipe em rounds por lado, respeitando a troca de lados.
  if v_map->>'team_a_start_side'='TR' then
   v_a_tr:=v_a1;v_b_ct:=v_b1;v_a_ct:=v_a2;v_b_tr:=v_b2;
  else v_a_ct:=v_a1;v_b_tr:=v_b1;v_a_tr:=v_a2;v_b_ct:=v_b2;end if;
  v_a_tr:=v_a_tr+v_atr;v_a_ct:=v_a_ct+v_act;v_b_tr:=v_b_tr+v_btr;v_b_ct:=v_b_ct+v_bct;
  for v_row in select value from jsonb_array_elements(p_player_stats) loop
   v_player:=(v_row->>'player_id')::uuid;v_team_side:=v_row->>'team_side';
   if v_team_side='A' then
    insert into public.player_side_round_stats(player_id,match_id,map_number,side,rounds_won,rounds_played) values(v_player,v_id,v_no,'TR',v_a_tr,(case when v_map->>'team_a_start_side'='TR' then 12 else v_a2+v_b2 end)+3*((v_atr+v_act+v_btr+v_bct)/6)),(v_player,v_id,v_no,'CT',v_a_ct,(case when v_map->>'team_a_start_side'='CT' then 12 else v_a2+v_b2 end)+3*((v_atr+v_act+v_btr+v_bct)/6));
   else
    insert into public.player_side_round_stats(player_id,match_id,map_number,side,rounds_won,rounds_played) values(v_player,v_id,v_no,'TR',v_b_tr,(case when v_map->>'team_a_start_side'='CT' then 12 else v_a2+v_b2 end)+3*((v_atr+v_act+v_btr+v_bct)/6)),(v_player,v_id,v_no,'CT',v_b_ct,(case when v_map->>'team_a_start_side'='TR' then 12 else v_a2+v_b2 end)+3*((v_atr+v_act+v_btr+v_bct)/6));
   end if;
  end loop;
 end loop;
 for v_row in select value from jsonb_array_elements(p_player_stats) loop
  v_player:=nullif(v_row->>'player_id','')::uuid;v_team_side:=v_row->>'team_side';
  if v_player is null or v_team_side not in('A','B') then raise exception 'Jogador participante sem equipe definida.';end if;
  if v_player=any(v_seen) then raise exception 'Jogador duplicado na escalação.';end if;v_seen:=array_append(v_seen,v_player);
  if not exists(select 1 from public.players where id=v_player) then raise exception 'Jogador não encontrado.';end if;
  insert into public.player_match_stats(match_id,player_id,team_side,kills,deaths,assists,adr,headshot_pct,mvps,first_kills,first_deaths,clutches_won)
  values(v_id,v_player,v_team_side,greatest(0,coalesce((v_row->>'kills')::integer,0)),greatest(0,coalesce((v_row->>'deaths')::integer,0)),greatest(0,coalesce((v_row->>'assists')::integer,0)),nullif(v_row->>'adr','')::numeric,nullif(v_row->>'headshot_pct','')::numeric,greatest(0,coalesce((v_row->>'mvps')::integer,0)),greatest(0,coalesce((v_row->>'first_kills')::integer,0)),greatest(0,coalesce((v_row->>'first_deaths')::integer,0)),greatest(0,coalesce((v_row->>'clutches_won')::integer,0)));
  perform public.acs_recalculate_player_stats(v_player);
 end loop;
 return v_id;
end; $$;
revoke all on function public.acs_admin_record_series(jsonb,jsonb,jsonb) from public,anon;
grant execute on function public.acs_admin_record_series(jsonb,jsonb,jsonb) to authenticated;

notify pgrst,'reload schema';

-- Recalcula Rating AM considerando empate de série MD2 como meia vitória.
create or replace function public.acs_recalculate_player_stats(p_player_id uuid)
returns void language plpgsql security definer set search_path=public,auth as $$
declare v_matches integer;v_kills integer;v_deaths integer;v_mvps integer;v_first_kills integer;v_first_deaths integer;v_clutches integer;v_kd numeric;v_adr numeric;v_hs numeric;v_win numeric;v_rating numeric;
begin
 select count(*),coalesce(sum(pms.kills),0),coalesce(sum(pms.deaths),0),coalesce(sum(pms.mvps),0),coalesce(sum(pms.first_kills),0),coalesce(sum(pms.first_deaths),0),coalesce(sum(pms.clutches_won),0),avg(pms.adr),avg(pms.headshot_pct)
 into v_matches,v_kills,v_deaths,v_mvps,v_first_kills,v_first_deaths,v_clutches,v_adr,v_hs
 from public.player_match_stats pms join public.matches m on m.id=pms.match_id where pms.player_id=p_player_id and m.status='completed';
 select case when count(*)=0 then 0 else 100.0*sum(case
   when pms.team_side='A' and m.team_a_score>m.team_b_score then 1.0
   when pms.team_side='B' and m.team_b_score>m.team_a_score then 1.0
   when m.team_a_score=m.team_b_score then 0.5 else 0.0 end)/count(*) end
 into v_win from public.player_match_stats pms join public.matches m on m.id=pms.match_id
 where pms.player_id=p_player_id and m.status='completed' and pms.team_side is not null;
 v_kd:=case when v_deaths=0 then v_kills::numeric else v_kills::numeric/v_deaths end;
 v_rating:=round((least(100,greatest(0,coalesce(v_kd,0)*50))*0.35+least(100,greatest(0,coalesce(v_adr,0)/1.5))*0.25+least(100,greatest(0,coalesce(v_hs,0)/0.6))*0.15+least(100,greatest(0,coalesce(v_win,0)))*0.20+least(100,greatest(0,case when v_matches=0 then 0 else v_mvps::numeric/v_matches*100 end))*0.05)::numeric,2);
 insert into public.player_competitive_stats(player_id,rating_am,kd,adr,headshot_pct,win_rate,matches,mvps,kills,deaths,first_kills,first_deaths,clutches,updated_at)
 values(p_player_id,v_rating,round(v_kd,3),round(v_adr,2),round(v_hs,2),round(v_win,2),v_matches,v_mvps,v_kills,v_deaths,v_first_kills,v_first_deaths,v_clutches,now())
 on conflict(player_id) do update set rating_am=excluded.rating_am,kd=excluded.kd,adr=excluded.adr,headshot_pct=excluded.headshot_pct,win_rate=excluded.win_rate,matches=excluded.matches,mvps=excluded.mvps,kills=excluded.kills,deaths=excluded.deaths,first_kills=excluded.first_kills,first_deaths=excluded.first_deaths,clutches=excluded.clutches,updated_at=now();
end; $$;
revoke all on function public.acs_recalculate_player_stats(uuid) from public,anon,authenticated;
