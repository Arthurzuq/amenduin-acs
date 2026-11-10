-- ACS 4.3.1 — reforço de segurança e aceite de transferência somente pela função oficial.
-- Já aplicada no projeto amenduin-acs em 10/11/2026. É reaplicável (pode rodar de novo sem problema).
-- Execute depois da ACS 4.3.

-- 1) Views públicas passam a respeitar as políticas (RLS) de quem consulta.
alter view public.acs_player_map_stats set (security_invoker = true);
alter view public.acs_team_rankings set (security_invoker = true);
alter view public.acs_team_map_stats set (security_invoker = true);

-- 2) Visitantes (anon) só leem. Ninguém precisa de truncate/references/trigger pela API.
revoke insert, update, delete, truncate, references, trigger on all tables in schema public from anon;
revoke truncate, references, trigger on all tables in schema public from authenticated;
revoke insert, update, delete on public.acs_player_map_stats, public.acs_team_rankings, public.acs_team_map_stats from authenticated;

-- 3) Funções de trigger não devem ser chamáveis pela API.
revoke execute on function public.acs_log_stats_change() from public, anon, authenticated;
revoke execute on function public.guard_transfer_offer_update() from public, anon, authenticated;
drop function if exists public.apply_accepted_transfer_offer();

-- 4) 'accepted' só pode ser gravado pela função acs_accept_transfer_offer.
create or replace function public.guard_transfer_offer_update()
returns trigger language plpgsql security definer set search_path = public, auth as $$
declare
  target_owner uuid;
  proposer_owner uuid;
begin
  select user_id into target_owner from public.players where id = old.target_player_id;
  select user_id into proposer_owner from public.players where id = old.offered_by_player_id;
  if new.target_player_id <> old.target_player_id
     or new.offered_by_player_id <> old.offered_by_player_id
     or new.message is distinct from old.message
     or old.status <> 'pending'
     or new.status not in ('accepted','rejected','cancelled') then
    raise exception 'Esta proposta não pode ser alterada dessa forma.';
  end if;
  if new.status = 'accepted' and coalesce(current_setting('acs.accepting_transfer', true), '') <> 'on' then
    raise exception 'Use o botão Aceitar para concluir a transferência.';
  end if;
  if auth.uid() = target_owner then
    if new.status not in ('accepted','rejected') then
      raise exception 'O destinatário só pode aceitar ou recusar a proposta.';
    end if;
  elsif auth.uid() = proposer_owner then
    if new.status <> 'cancelled' then
      raise exception 'O autor só pode cancelar a própria proposta.';
    end if;
  else
    raise exception 'Você não participa desta proposta.';
  end if;
  return new;
end;
$$;

create or replace function public.acs_accept_transfer_offer(p_offer_id uuid)
returns void language plpgsql security definer set search_path=public,auth as $$
declare v_offer public.transfer_offers%rowtype; v_target public.players%rowtype; v_proposer public.players%rowtype; v_team public.teams%rowtype; v_old_team text; v_old_team_id uuid;
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
 perform set_config('acs.accepting_transfer','on',true);
 update public.transfer_offers set status='accepted',decided_at=now() where id=p_offer_id;
 perform set_config('acs.accepting_transfer','off',true);
 insert into public.transfers(player_id,from_team,to_team,status,proposed_by,decided_at) values(v_target.id,coalesce(v_old_team,nullif(v_target.team_name,''),'Sem equipe'),v_team.name,'accepted',v_proposer.user_id,now());
end; $$;
revoke all on function public.acs_accept_transfer_offer(uuid) from public,anon;
grant execute on function public.acs_accept_transfer_offer(uuid) to authenticated;

notify pgrst, 'reload schema';
