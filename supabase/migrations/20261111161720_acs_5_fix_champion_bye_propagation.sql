-- ACS 5.0: propagate a single-team BYE champion into the Grand Final.
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
