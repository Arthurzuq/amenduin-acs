-- ACS 4.3 — transferências reais, elencos sem limite, MD1/MD3/MD5 e estatísticas por mapa.
-- Execute UMA vez, inteiro, depois das migrations ACS 4.2 e 4.2.1.

begin;

-- Elencos sem limite artificial de vagas.
alter table public.teams alter column capacity drop not null;
alter table public.teams alter column capacity set default null;
update public.teams set capacity=null;

create or replace function public.acs_create_team(p_name text,p_tag text,p_capacity integer default null)
returns uuid language plpgsql security definer set search_path=public,auth as $$
declare v_player public.players%rowtype; v_team_id uuid;
begin
 if auth.uid() is null then raise exception 'Entre na sua conta para criar uma equipe.'; end if;
 select * into v_player from public.players where user_id=auth.uid() for update;
 if not found then raise exception 'Crie seu perfil de jogador antes de criar uma equipe.'; end if;
 if exists(select 1 from public.team_members where player_id=v_player.id) then raise exception 'Você já faz parte de uma equipe.'; end if;
 if length(trim(coalesce(p_name,'')))<3 then raise exception 'O nome da equipe precisa ter ao menos 3 caracteres.'; end if;
 insert into public.teams(name,tag,captain_player_id,capacity) values(trim(p_name),nullif(trim(p_tag),''),v_player.id,null) returning id into v_team_id;
 insert into public.team_members(team_id,player_id,role) values(v_team_id,v_player.id,'captain');
 update public.players set team_name=trim(p_name),updated_at=now() where id=v_player.id;
 return v_team_id;
end; $$;

create or replace function public.acs_invite_player(p_team_id uuid,p_player_id uuid)
returns uuid language plpgsql security definer set search_path=public,auth as $$
declare v_captain uuid; v_invite uuid;
begin
 select tm.player_id into v_captain from public.team_members tm join public.players p on p.id=tm.player_id
 where tm.team_id=p_team_id and tm.role='captain' and p.user_id=auth.uid();
 if v_captain is null then raise exception 'Somente o capitão pode convidar jogadores.'; end if;
 if p_player_id=v_captain then raise exception 'Você já é o capitão desta equipe.'; end if;
 if exists(select 1 from public.team_members where player_id=p_player_id) then raise exception 'Este jogador já faz parte de uma equipe.'; end if;
 insert into public.team_invites(team_id,invited_player_id,invited_by_player_id) values(p_team_id,p_player_id,v_captain) returning id into v_invite;
 return v_invite;
end; $$;

create or replace function public.acs_respond_team_invite(p_invite_id uuid,p_accept boolean)
returns void language plpgsql security definer set search_path=public,auth as $$
declare v_invite public.team_invites%rowtype; v_player public.players%rowtype; v_team public.teams%rowtype;
begin
 select * into v_invite from public.team_invites where id=p_invite_id for update;
 if not found or v_invite.status<>'pending' then raise exception 'Este convite não está mais disponível.'; end if;
 select * into v_player from public.players where id=v_invite.invited_player_id and user_id=auth.uid() for update;
 if not found then raise exception 'Este convite não pertence à sua conta.'; end if;
 if p_accept then
  if exists(select 1 from public.team_members where player_id=v_player.id) then raise exception 'Você já faz parte de uma equipe.'; end if;
  select * into v_team from public.teams where id=v_invite.team_id for update;
  if not found then raise exception 'Equipe não encontrada.'; end if;
  insert into public.team_members(team_id,player_id,role) values(v_team.id,v_player.id,'member');
  update public.players set team_name=v_team.name,updated_at=now() where id=v_player.id;
  update public.team_invites set status='accepted',decided_at=now() where id=p_invite_id;
  update public.team_invites set status='cancelled',decided_at=now() where invited_player_id=v_player.id and status='pending' and id<>p_invite_id;
 else update public.team_invites set status='rejected',decided_at=now() where id=p_invite_id; end if;
end; $$;

-- Aceitar proposta transfere de fato o jogador entre os elencos.
drop trigger if exists trg_apply_accepted_transfer_offer on public.transfer_offers;
create or replace function public.acs_accept_transfer_offer(p_offer_id uuid)
returns void language plpgsql security definer set search_path=public,auth as $$
declare v_offer public.transfer_offers%rowtype; v_target public.players%rowtype; v_proposer public.players%rowtype; v_team public.teams%rowtype; v_old_team text; v_old_team_id uuid; v_proposer_user uuid;
begin
 select * into v_offer from public.transfer_offers where id=p_offer_id for update;
 if not found or v_offer.status<>'pending' then raise exception 'Esta proposta não está mais disponível.'; end if;
 select * into v_target from public.players where id=v_offer.target_player_id and user_id=auth.uid() for update;
 if not found then raise exception 'Somente o jogador que recebeu a proposta pode aceitá-la.'; end if;
 select * into v_proposer from public.players where id=v_offer.offered_by_player_id;
 if not found then raise exception 'Jogador que enviou a proposta não foi encontrado.'; end if;
 select tm.team_id,t.name into v_old_team_id,v_old_team from public.team_members tm join public.teams t on t.id=tm.team_id where tm.player_id=v_target.id;
 if exists(select 1 from public.team_members where player_id=v_target.id and role='captain') then raise exception 'O capitão precisa transferir a liderança antes de aceitar uma transferência.'; end if;
 select t.* into v_team from public.team_members tm join public.teams t on t.id=tm.team_id where tm.player_id=v_proposer.id;
 if not found then raise exception 'O jogador que enviou a proposta não pertence a uma equipe.'; end if;
 if v_old_team_id=v_team.id then raise exception 'Este jogador já pertence à equipe que enviou a proposta.'; end if;
 delete from public.team_members where player_id=v_target.id;
 insert into public.team_members(team_id,player_id,role) values(v_team.id,v_target.id,'member');
 update public.players set team_name=v_team.name,market_status='Intocável',updated_at=now() where id=v_target.id;
 update public.team_invites set status='cancelled',decided_at=now() where invited_player_id=v_target.id and status='pending';
 update public.transfer_offers set status='accepted',decided_at=now() where id=p_offer_id;
 insert into public.transfers(player_id,from_team,to_team,status,proposed_by,decided_at) values(v_target.id,coalesce(v_old_team,nullif(v_target.team_name,''),'Sem equipe'),v_team.name,'accepted',v_proposer.user_id,now());
end; $$;
revoke all on function public.acs_accept_transfer_offer(uuid) from public,anon;
grant execute on function public.acs_accept_transfer_offer(uuid) to authenticated;

-- Escalação e status por partida.
create table if not exists public.match_player_rosters(
 id bigint generated always as identity primary key,
 match_id uuid not null references public.matches(id) on delete cascade,
 player_id uuid not null references public.players(id) on delete cascade,
 team_side text not null check(team_side in ('A','B')),
 participation_status text not null check(participation_status in ('starter','reserve','not_played')),
 unique(match_id,player_id)
);
alter table public.match_player_rosters enable row level security;
drop policy if exists "Public can view match rosters" on public.match_player_rosters;
create policy "Public can view match rosters" on public.match_player_rosters for select using(true);
grant select on public.match_player_rosters to anon,authenticated;
revoke insert,update,delete on public.match_player_rosters from anon,authenticated;

-- Estatísticas individuais separadas por mapa.
create table if not exists public.player_map_stats(
 id bigint generated always as identity primary key,
 match_id uuid not null references public.matches(id) on delete cascade,
 player_id uuid not null references public.players(id) on delete cascade,
 map_number integer not null,
 map_name text not null,
 kills integer not null default 0 check(kills>=0), deaths integer not null default 0 check(deaths>=0), assists integer not null default 0 check(assists>=0),
 adr numeric(6,2), headshot_pct numeric(5,2), mvps integer not null default 0 check(mvps>=0),
 first_kills integer not null default 0 check(first_kills>=0), first_deaths integer not null default 0 check(first_deaths>=0), clutches_won integer not null default 0 check(clutches_won>=0),
 unique(match_id,player_id,map_number)
);
alter table public.player_map_stats enable row level security;
drop policy if exists "Public can view player map stats" on public.player_map_stats;
create policy "Public can view player map stats" on public.player_map_stats for select using(true);
grant select on public.player_map_stats to anon,authenticated;
revoke insert,update,delete on public.player_map_stats from anon,authenticated;

create or replace view public.acs_player_map_stats as
select player_id,map_name,count(*)::integer matches,sum(kills)::integer kills,sum(deaths)::integer deaths,sum(assists)::integer assists,
 avg(adr)::numeric(6,2) adr,avg(headshot_pct)::numeric(5,2) headshot_pct,sum(mvps)::integer mvps
from public.player_map_stats group by player_id,map_name;
grant select on public.acs_player_map_stats to anon,authenticated;

-- Ajusta limites de mapas e formatos sem MD2.
do $$ declare c record; begin
 for c in select conname from pg_constraint where conrelid='public.matches'::regclass and contype='c' and pg_get_constraintdef(oid) ilike '%best_of%'
 loop execute format('alter table public.matches drop constraint %I',c.conname); end loop;
end $$;
alter table public.matches add constraint matches_best_of_check check(best_of in (1,3,5));
do $$ declare c record; begin
 for c in select conname from pg_constraint where conrelid='public.match_maps'::regclass and contype='c' and pg_get_constraintdef(oid) ilike '%map_number%'
 loop execute format('alter table public.match_maps drop constraint %I',c.conname); end loop;
end $$;
alter table public.match_maps add constraint match_maps_map_number_check check(map_number between 1 and 5);

create or replace function public.acs_admin_record_series(p_match jsonb,p_maps jsonb,p_player_stats jsonb)
returns uuid language plpgsql security definer set search_path=public,auth as $$
declare
 v_id uuid; v_a uuid; v_b uuid; v_name_a text; v_name_b text; v_bo integer;
 v_map jsonb; v_row jsonb; v_map_stat jsonb; v_no integer:=0; v_wins_a integer:=0; v_wins_b integer:=0;
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
 if v_bo not in(1,3,5) then raise exception 'Formato inválido. Use MD1, MD3 ou MD5.'; end if;
 if jsonb_typeof(p_maps)<>'array' or (v_bo=1 and jsonb_array_length(p_maps)<>1) or (v_bo=3 and jsonb_array_length(p_maps) not between 2 and 3) or (v_bo=5 and jsonb_array_length(p_maps) not between 3 and 5) then raise exception 'Quantidade de mapas inválida para o formato selecionado.'; end if;
 if jsonb_typeof(p_player_stats)<>'array' or jsonb_array_length(p_player_stats)<1 then raise exception 'Selecione ao menos um jogador participante.'; end if;
 -- Valida e calcula a série antes de persistir.
 for v_map in select value from jsonb_array_elements(p_maps) loop
  if (v_bo=3 and greatest(v_wins_a,v_wins_b)>=2) or (v_bo=5 and greatest(v_wins_a,v_wins_b)>=3) then raise exception 'A série já havia sido decidida antes do último mapa informado.'; end if;
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
 if v_wins_a=v_wins_b then raise exception 'A série precisa ter um vencedor.'; end if;
 if v_bo=1 and (v_wins_a+v_wins_b)<>1 then raise exception 'MD1 deve conter um mapa.'; end if;
 if v_bo=3 and greatest(v_wins_a,v_wins_b)<2 then raise exception 'A série MD3 precisa de duas vitórias em mapas.'; end if;
 if v_bo=5 and greatest(v_wins_a,v_wins_b)<3 then raise exception 'A série MD5 precisa de três vitórias em mapas.'; end if;
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
   if coalesce(v_row->>'participation_status','starter')<>'not_played' and v_team_side='A' then
    insert into public.player_side_round_stats(player_id,match_id,map_number,side,rounds_won,rounds_played) values(v_player,v_id,v_no,'TR',v_a_tr,(case when v_map->>'team_a_start_side'='TR' then 12 else v_a2+v_b2 end)+3*((v_atr+v_act+v_btr+v_bct)/6)),(v_player,v_id,v_no,'CT',v_a_ct,(case when v_map->>'team_a_start_side'='CT' then 12 else v_a2+v_b2 end)+3*((v_atr+v_act+v_btr+v_bct)/6));
   elsif coalesce(v_row->>'participation_status','starter')<>'not_played' then
    insert into public.player_side_round_stats(player_id,match_id,map_number,side,rounds_won,rounds_played) values(v_player,v_id,v_no,'TR',v_b_tr,(case when v_map->>'team_a_start_side'='CT' then 12 else v_a2+v_b2 end)+3*((v_atr+v_act+v_btr+v_bct)/6)),(v_player,v_id,v_no,'CT',v_b_ct,(case when v_map->>'team_a_start_side'='TR' then 12 else v_a2+v_b2 end)+3*((v_atr+v_act+v_btr+v_bct)/6));
   end if;
  end loop;
 end loop;
 for v_row in select value from jsonb_array_elements(p_player_stats) loop
  v_player:=nullif(v_row->>'player_id','')::uuid;v_team_side:=v_row->>'team_side';
  if v_player is null or v_team_side not in('A','B') then raise exception 'Jogador participante sem equipe definida.';end if;
  if v_player=any(v_seen) then raise exception 'Jogador duplicado na escalação.';end if;v_seen:=array_append(v_seen,v_player);
  if not exists(select 1 from public.players where id=v_player) then raise exception 'Jogador não encontrado.';end if;
  insert into public.match_player_rosters(match_id,player_id,team_side,participation_status)
  values(v_id,v_player,v_team_side,coalesce(nullif(v_row->>'participation_status',''),'starter'));
  if coalesce(v_row->>'participation_status','starter')<>'not_played' then
   insert into public.player_match_stats(match_id,player_id,team_side,kills,deaths,assists,adr,headshot_pct,mvps,first_kills,first_deaths,clutches_won)
   values(v_id,v_player,v_team_side,greatest(0,coalesce((v_row->>'kills')::integer,0)),greatest(0,coalesce((v_row->>'deaths')::integer,0)),greatest(0,coalesce((v_row->>'assists')::integer,0)),nullif(v_row->>'adr','')::numeric,nullif(v_row->>'headshot_pct','')::numeric,greatest(0,coalesce((v_row->>'mvps')::integer,0)),greatest(0,coalesce((v_row->>'first_kills')::integer,0)),greatest(0,coalesce((v_row->>'first_deaths')::integer,0)),greatest(0,coalesce((v_row->>'clutches_won')::integer,0)));
   for v_map_stat in select value from jsonb_array_elements(coalesce(v_row->'map_stats','[]'::jsonb)) loop
    insert into public.player_map_stats(match_id,player_id,map_number,map_name,kills,deaths,assists,adr,headshot_pct,mvps,first_kills,first_deaths,clutches_won)
    select v_id,v_player,(v_map_stat->>'map_number')::integer,mm.map_name,
      greatest(0,coalesce((v_map_stat->>'kills')::integer,0)),greatest(0,coalesce((v_map_stat->>'deaths')::integer,0)),greatest(0,coalesce((v_map_stat->>'assists')::integer,0)),
      nullif(v_map_stat->>'adr','')::numeric,nullif(v_map_stat->>'headshot_pct','')::numeric,greatest(0,coalesce((v_map_stat->>'mvps')::integer,0)),
      greatest(0,coalesce((v_map_stat->>'first_kills')::integer,0)),greatest(0,coalesce((v_map_stat->>'first_deaths')::integer,0)),greatest(0,coalesce((v_map_stat->>'clutches_won')::integer,0))
    from public.match_maps mm where mm.match_id=v_id and mm.map_number=(v_map_stat->>'map_number')::integer;
   end loop;
   perform public.acs_recalculate_player_stats(v_player);
  end if;
 end loop;
 return v_id;
end; $$;
revoke all on function public.acs_admin_record_series(jsonb,jsonb,jsonb) from public,anon;
grant execute on function public.acs_admin_record_series(jsonb,jsonb,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
