-- ACS 8.0: salary is part of every new market recruitment offer.
alter table public.transfer_offers
  add column if not exists weekly_salary numeric(12,2);

alter table public.transfer_offers
  drop constraint if exists transfer_offers_weekly_salary_check;
alter table public.transfer_offers
  add constraint transfer_offers_weekly_salary_check
  check (weekly_salary is null or (weekly_salary >= 0 and weekly_salary <= 1000000));

create or replace function public.acs_create_transfer_offer(
  p_target_player_id uuid,
  p_weekly_salary numeric,
  p_message text default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public','auth'
as $function$
declare
  v_proposer public.players%rowtype;
  v_target public.players%rowtype;
  v_team_id uuid;
  v_offer_id uuid;
begin
  if auth.uid() is null then raise exception 'Entre na sua conta.'; end if;
  if p_weekly_salary is null or p_weekly_salary <= 0 or p_weekly_salary > 1000000 then
    raise exception 'Defina um salário semanal maior que $0 e de até $1.000.000.';
  end if;

  select * into v_proposer
  from public.players
  where user_id=auth.uid()
  order by created_at
  limit 1
  for update;

  if not found then raise exception 'Seu usuário não possui um perfil de jogador.'; end if;

  select tm.team_id into v_team_id
  from public.team_members tm
  where tm.player_id=v_proposer.id and tm.role='captain'
  limit 1;

  if v_team_id is null then raise exception 'Somente o capitão pode enviar propostas pelo Mercado.'; end if;

  select * into v_target
  from public.players
  where id=p_target_player_id
  for update;

  if not found or v_target.id=v_proposer.id then
    raise exception 'Jogador de destino inválido.';
  end if;

  if exists(select 1 from public.team_members where team_id=v_team_id and player_id=v_target.id) then
    raise exception 'Este jogador já pertence à sua equipe.';
  end if;

  if exists(select 1 from public.transfer_offers
    where target_player_id=v_target.id and offered_by_player_id=v_proposer.id and status='pending') then
    raise exception 'Já existe uma proposta pendente para este jogador.';
  end if;

  insert into public.transfer_offers(target_player_id,offered_by_player_id,message,weekly_salary)
  values(v_target.id,v_proposer.id,nullif(left(coalesce(p_message,''),500),''),p_weekly_salary)
  returning id into v_offer_id;

  return v_offer_id;
end;
$function$;

create or replace function public.acs_accept_transfer_offer(p_offer_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public','auth'
as $function$
declare
  v_offer public.transfer_offers%rowtype;
  v_target public.players%rowtype;
  v_proposer public.players%rowtype;
  v_team public.teams%rowtype;
  v_old_team text;
  v_old_team_id uuid;
begin
  select * into v_offer from public.transfer_offers where id=p_offer_id for update;
  if not found or v_offer.status<>'pending' then
    raise exception 'Esta proposta não está mais disponível.';
  end if;

  select * into v_target from public.players
  where id=v_offer.target_player_id and user_id=auth.uid()
  for update;
  if not found then
    raise exception 'Somente o jogador que recebeu a proposta pode aceitá-la.';
  end if;

  select * into v_proposer from public.players where id=v_offer.offered_by_player_id;
  if not found then raise exception 'Jogador que enviou a proposta não foi encontrado.'; end if;

  select tm.team_id,t.name into v_old_team_id,v_old_team
  from public.team_members tm join public.teams t on t.id=tm.team_id
  where tm.player_id=v_target.id;

  if exists(select 1 from public.team_members where player_id=v_target.id and role='captain') then
    raise exception 'O capitão precisa transferir a liderança antes de aceitar uma transferência.';
  end if;

  select t.* into v_team
  from public.team_members tm join public.teams t on t.id=tm.team_id
  where tm.player_id=v_proposer.id and tm.role='captain';
  if not found then raise exception 'O capitão que enviou a proposta não pertence mais à equipe.'; end if;

  if v_old_team_id=v_team.id then raise exception 'Este jogador já pertence à equipe que enviou a proposta.'; end if;

  delete from public.team_members where player_id=v_target.id;
  insert into public.team_members(team_id,player_id,role) values(v_team.id,v_target.id,'member');

  update public.players
  set team_name=v_team.name,market_status='Intocável',updated_at=now()
  where id=v_target.id;

  update public.team_invites
  set status='cancelled',decided_at=now()
  where invited_player_id=v_target.id and status='pending';

  if coalesce(v_offer.weekly_salary,0)>0 then
    insert into public.team_salary_contracts(team_id,player_id,weekly_salary,active,set_by,updated_at)
    values(v_team.id,v_target.id,v_offer.weekly_salary,true,v_proposer.user_id,now())
    on conflict (team_id,player_id) do update
    set weekly_salary=excluded.weekly_salary,active=true,set_by=excluded.set_by,updated_at=now();
  end if;

  perform set_config('acs.accepting_transfer','on',true);
  update public.transfer_offers set status='accepted',decided_at=now() where id=p_offer_id;
  perform set_config('acs.accepting_transfer','off',true);

  insert into public.transfers(player_id,from_team,to_team,status,proposed_by,decided_at)
  values(v_target.id,coalesce(v_old_team,nullif(v_target.team_name,''),'Sem equipe'),v_team.name,'accepted',v_proposer.user_id,now());
end;
$function$;

revoke all on function public.acs_create_transfer_offer(uuid,numeric,text) from public,anon;
grant execute on function public.acs_create_transfer_offer(uuid,numeric,text) to authenticated;
revoke all on function public.acs_accept_transfer_offer(uuid) from public,anon;
grant execute on function public.acs_accept_transfer_offer(uuid) to authenticated;
