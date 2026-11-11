-- ACS 5.0: cloud draft uniqueness and guarded Upper/Lower playoff builder.
CREATE UNIQUE INDEX IF NOT EXISTS match_drafts_owner_unique ON public.match_drafts (owner_user_id);

CREATE SCHEMA IF NOT EXISTS acs_private;
REVOKE ALL ON SCHEMA acs_private FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION acs_private.build_elimination_side(p_tournament_id uuid, p_stage_id uuid, p_bracket_side text, p_team_ids uuid[], p_grand_final_node_id uuid, p_grand_final_slot text)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_team_count integer;
  v_bracket_size integer := 1;
  v_target_size integer := 4;
  v_positions integer[] := ARRAY[1,2];
  v_next_positions integer[];
  v_seed integer;
  v_match_no integer;
  v_seed_a integer;
  v_seed_b integer;
  v_team_a uuid;
  v_team_b uuid;
  v_node_id uuid;
  v_prev_nodes uuid[] := '{}'::uuid[];
  v_next_nodes uuid[];
  v_prev_a uuid;
  v_prev_b uuid;
  v_prev_a_status text;
  v_prev_b_status text;
  v_prev_a_winner uuid;
  v_prev_b_winner uuid;
  v_round integer := 1;
  v_match_count integer;
  v_champion_node uuid;
  v_champion_status text;
  v_champion_team uuid;
BEGIN
  if p_bracket_side not in ('upper','lower') then
    raise exception 'Lado de chaveamento inválido.';
  end if;
  if p_grand_final_slot not in ('A','B') then
    raise exception 'Vaga da grande final inválida.';
  end if;
  v_team_count := coalesce(array_length(p_team_ids,1),0);
  if v_team_count < 2 then
    raise exception 'A geração de uma chave eliminatória exige pelo menos duas equipes.';
  end if;
  while v_bracket_size < v_team_count loop
    v_bracket_size := v_bracket_size * 2;
  end loop;

  while v_target_size <= v_bracket_size loop
    v_next_positions := '{}'::integer[];
    foreach v_seed in array v_positions loop
      v_next_positions := array_append(v_next_positions,v_seed);
      v_next_positions := array_append(v_next_positions,v_target_size+1-v_seed);
    end loop;
    v_positions := v_next_positions;
    v_target_size := v_target_size * 2;
  end loop;

  v_match_count := v_bracket_size/2;
  for v_match_no in 1..v_match_count loop
    v_seed_a := v_positions[(v_match_no*2)-1];
    v_seed_b := v_positions[v_match_no*2];
    v_team_a := case when v_seed_a<=v_team_count then p_team_ids[v_seed_a] else null end;
    v_team_b := case when v_seed_b<=v_team_count then p_team_ids[v_seed_b] else null end;
    insert into public.tournament_bracket_nodes(
      tournament_id,stage_id,bracket_side,round_number,match_number,
      team_a_id,team_b_id,winner_team_id,status,config
    ) values(
      p_tournament_id,p_stage_id,p_bracket_side,1,v_match_no,
      v_team_a,v_team_b,
      case when v_team_a is null then v_team_b when v_team_b is null then v_team_a else null end,
      case when v_team_a is not null and v_team_b is not null then 'ready' else 'bye' end,
      jsonb_build_object(
        'label',(case when p_bracket_side='upper' then 'Upper' else 'Lower' end)||' · Rodada 1',
        'seed_a',v_seed_a,'seed_b',v_seed_b,
        'automatic_bye',(v_team_a is null or v_team_b is null)
      )
    ) returning id into v_node_id;
    v_prev_nodes := array_append(v_prev_nodes,v_node_id);
  end loop;

  while array_length(v_prev_nodes,1)>1 loop
    v_round := v_round+1;
    v_next_nodes := '{}'::uuid[];
    v_match_count := array_length(v_prev_nodes,1)/2;
    for v_match_no in 1..v_match_count loop
      v_prev_a := v_prev_nodes[(v_match_no*2)-1];
      v_prev_b := v_prev_nodes[v_match_no*2];
      select status,winner_team_id into v_prev_a_status,v_prev_a_winner
      from public.tournament_bracket_nodes where id=v_prev_a;
      select status,winner_team_id into v_prev_b_status,v_prev_b_winner
      from public.tournament_bracket_nodes where id=v_prev_b;
      v_team_a := case when v_prev_a_status='bye' then v_prev_a_winner else null end;
      v_team_b := case when v_prev_b_status='bye' then v_prev_b_winner else null end;
      insert into public.tournament_bracket_nodes(
        tournament_id,stage_id,bracket_side,round_number,match_number,
        team_a_id,team_b_id,status,config
      ) values(
        p_tournament_id,p_stage_id,p_bracket_side,v_round,v_match_no,
        v_team_a,v_team_b,
        case when v_team_a is not null and v_team_b is not null then 'ready' else 'pending' end,
        jsonb_build_object(
          'label',(case when p_bracket_side='upper' then 'Upper' else 'Lower' end)||' · Rodada '||v_round,
          'source_a',v_prev_a,'source_b',v_prev_b
        )
      ) returning id into v_node_id;
      if v_prev_a_status<>'bye' then
        update public.tournament_bracket_nodes
        set next_winner_node_id=v_node_id,next_winner_slot='A',updated_at=now()
        where id=v_prev_a;
      end if;
      if v_prev_b_status<>'bye' then
        update public.tournament_bracket_nodes
        set next_winner_node_id=v_node_id,next_winner_slot='B',updated_at=now()
        where id=v_prev_b;
      end if;
      v_next_nodes := array_append(v_next_nodes,v_node_id);
    end loop;
    v_prev_nodes := v_next_nodes;
  end loop;

  v_champion_node := v_prev_nodes[1];
  select status,winner_team_id into v_champion_status,v_champion_team
  from public.tournament_bracket_nodes where id=v_champion_node;
  if v_champion_status='bye' then
    update public.tournament_bracket_nodes
    set team_a_id=case when p_grand_final_slot='A' then v_champion_team else team_a_id end,
        team_b_id=case when p_grand_final_slot='B' then v_champion_team else team_b_id end,
        status=case
          when (case when p_grand_final_slot='A' then v_champion_team else team_a_id end) is not null
           and (case when p_grand_final_slot='B' then v_champion_team else team_b_id end) is not null
          then 'ready' else 'pending' end,
        updated_at=now()
    where id=p_grand_final_node_id;
  else
    update public.tournament_bracket_nodes
    set next_winner_node_id=p_grand_final_node_id,
        next_winner_slot=p_grand_final_slot,
        updated_at=now()
    where id=v_champion_node;
  end if;
  return v_champion_node;
END;
$function$;
REVOKE ALL ON FUNCTION acs_private.build_elimination_side(uuid,uuid,text,uuid[],uuid,text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.acs_admin_build_playoffs(p_tournament_id uuid, p_upper_team_ids uuid[], p_lower_team_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'acs_private'
AS $function$
DECLARE
  v_tournament public.tournaments%rowtype;
  v_stage public.tournament_stages%rowtype;
  v_first_stage_id uuid;
  v_approved uuid[];
  v_combined uuid[];
  v_upper_count integer;
  v_lower_count integer;
  v_team uuid;
  v_seed integer;
  v_grand_final_id uuid;
  v_upper_champion uuid;
  v_lower_champion uuid;
  v_created_nodes integer;
BEGIN
  if auth.uid() is null or not public.acs_is_admin() then
    raise exception 'Apenas administradores podem gerar os playoffs.';
  end if;
  select * into v_tournament from public.tournaments where id=p_tournament_id for update;
  if not found then raise exception 'Campeonato não encontrado.'; end if;
  select * into v_stage from public.tournament_stages
  where tournament_id=p_tournament_id and stage_order=2 for update;
  if not found then raise exception 'A etapa de Upper/Lower não existe. Organize primeiro o campeonato.'; end if;
  select id into v_first_stage_id from public.tournament_stages
  where tournament_id=p_tournament_id and stage_order=1;
  if v_first_stage_id is null then raise exception 'A fase de grupos não existe. Organize primeiro o campeonato.'; end if;

  if exists (
    select 1 from public.tournament_bracket_nodes
    where stage_id=v_first_stage_id and bracket_side='groups' and status<>'completed'
  ) then
    raise exception 'Conclua todos os confrontos da fase de grupos antes de classificar as equipes.';
  end if;
  if exists (
    select 1 from public.tournament_bracket_nodes
    where stage_id=v_stage.id and bracket_side in ('upper','lower','grand_final')
  ) then raise exception 'Os playoffs já foram gerados para este campeonato.'; end if;
  if p_upper_team_ids is null or p_lower_team_ids is null
     or coalesce(array_length(p_upper_team_ids,1),0)<1
     or coalesce(array_length(p_lower_team_ids,1),0)<1 then
    raise exception 'Classifique pelo menos uma equipe em Upper e uma em Lower.';
  end if;

  v_upper_count := array_length(p_upper_team_ids,1);
  v_lower_count := array_length(p_lower_team_ids,1);
  v_combined := p_upper_team_ids || p_lower_team_ids;
  if exists(select 1 from unnest(v_combined) as x(team_id) where team_id is null)
     or (select count(*) from unnest(v_combined) as x(team_id))
        <> (select count(distinct team_id) from unnest(v_combined) as x(team_id)) then
    raise exception 'Cada equipe deve aparecer uma única vez na classificação.';
  end if;

  select coalesce(array_agg(r.team_id order by r.team_id),'{}'::uuid[])
  into v_approved
  from public.tournament_registrations r
  where r.tournament_id=p_tournament_id and r.status='approved';
  if coalesce(array_length(v_approved,1),0)<>array_length(v_combined,1)
     or exists(select 1 from unnest(v_approved) as a(team_id) where not(a.team_id=any(v_combined)))
     or exists(select 1 from unnest(v_combined) as a(team_id) where not(a.team_id=any(v_approved))) then
    raise exception 'Todas as equipes aprovadas precisam ser classificadas exatamente uma vez.';
  end if;
  if exists (
    select 1 from unnest(v_combined) as selected(team_id)
    where not exists(select 1 from public.tournament_stage_teams st
      where st.stage_id=v_first_stage_id and st.team_id=selected.team_id)
  ) then
    raise exception 'Uma equipe classificada não pertence à fase de grupos deste campeonato.';
  end if;
  if exists(select 1 from public.tournament_stage_teams where stage_id=v_stage.id) then
    raise exception 'A etapa de playoffs já contém equipes classificadas.';
  end if;

  v_seed:=0;
  foreach v_team in array p_upper_team_ids loop
    v_seed:=v_seed+1;
    insert into public.tournament_stage_teams(stage_id,team_id,seed,config)
    values(v_stage.id,v_team,v_seed,jsonb_build_object('bracket_side','upper'));
  end loop;
  v_seed:=0;
  foreach v_team in array p_lower_team_ids loop
    v_seed:=v_seed+1;
    insert into public.tournament_stage_teams(stage_id,team_id,seed,config)
    values(v_stage.id,v_team,v_seed,jsonb_build_object('bracket_side','lower'));
  end loop;

  insert into public.tournament_bracket_nodes(
    tournament_id,stage_id,bracket_side,round_number,match_number,status,config
  ) values(
    p_tournament_id,v_stage.id,'grand_final',1,1,'pending',
    jsonb_build_object('label','Grande Final','upper_winner_slot','A','lower_winner_slot','B')
  ) returning id into v_grand_final_id;

  if v_upper_count=1 then
    update public.tournament_bracket_nodes
    set team_a_id=p_upper_team_ids[1],updated_at=now() where id=v_grand_final_id;
  else
    v_upper_champion:=acs_private.build_elimination_side(
      p_tournament_id,v_stage.id,'upper',p_upper_team_ids,v_grand_final_id,'A'
    );
  end if;
  if v_lower_count=1 then
    update public.tournament_bracket_nodes
    set team_b_id=p_lower_team_ids[1],updated_at=now() where id=v_grand_final_id;
  else
    v_lower_champion:=acs_private.build_elimination_side(
      p_tournament_id,v_stage.id,'lower',p_lower_team_ids,v_grand_final_id,'B'
    );
  end if;
  update public.tournament_bracket_nodes
  set status=case when team_a_id is not null and team_b_id is not null then 'ready' else 'pending' end,
      updated_at=now()
  where id=v_grand_final_id;
  update public.tournament_stages
  set status='ready',format='playoff',
      config=coalesce(config,'{}'::jsonb)||jsonb_build_object(
        'playoffs_generated',true,'bracket_model','upper_lower_split_grand_final',
        'upper_team_count',v_upper_count,'lower_team_count',v_lower_count,
        'classification','admin_manual'
      )
  where id=v_stage.id;
  select count(*) into v_created_nodes from public.tournament_bracket_nodes where stage_id=v_stage.id;
  return jsonb_build_object(
    'status','created','tournament_id',p_tournament_id,'stage_id',v_stage.id,
    'grand_final_node_id',v_grand_final_id,'upper_team_count',v_upper_count,
    'lower_team_count',v_lower_count,'node_count',v_created_nodes,
    'upper_champion_node_id',v_upper_champion,'lower_champion_node_id',v_lower_champion,
    'bracket_model','upper_lower_split_grand_final'
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.acs_admin_build_playoffs(uuid,uuid[],uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.acs_admin_build_playoffs(uuid,uuid[],uuid[]) TO authenticated;
