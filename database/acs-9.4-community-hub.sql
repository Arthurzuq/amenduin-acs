-- ACS 9.4 Community Hub
-- Applied to Supabase project mzdkfmhexrdhercsbmlo on 2026-11-12.
-- Reference copy of the database changes; migrations were applied through Supabase MCP.

create table if not exists public.acs_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  body text not null default '',
  category text not null default 'system' check (category in ('team','market','match','economy','tournament','system')),
  target_page text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists acs_notifications_user_created_idx on public.acs_notifications(user_id,created_at desc);
alter table public.acs_notifications enable row level security;
drop policy if exists "Users read own ACS notifications" on public.acs_notifications;
create policy "Users read own ACS notifications" on public.acs_notifications for select to authenticated using (user_id=(select auth.uid()));
drop policy if exists "Users update own ACS notifications" on public.acs_notifications;
create policy "Users update own ACS notifications" on public.acs_notifications for update to authenticated using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()));
revoke all on table public.acs_notifications from public,anon;
grant select,update on table public.acs_notifications to authenticated;

create or replace function public.acs_notify_user(p_user_id uuid,p_title text,p_body text,p_category text,p_target_page text default null)
returns void language plpgsql security definer set search_path=public as $$
begin
 if p_user_id is not null then
  insert into public.acs_notifications(user_id,title,body,category,target_page)
  values(p_user_id,left(p_title,140),left(coalesce(p_body,''),500),coalesce(p_category,'system'),p_target_page);
 end if;
end; $$;
revoke all on function public.acs_notify_user(uuid,text,text,text,text) from public,anon,authenticated;

create or replace function public.acs_notify_team_invite()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_user uuid; v_team text; v_sender text;
begin
 select user_id into v_user from public.players where id=NEW.invited_player_id;
 select name into v_team from public.teams where id=NEW.team_id;
 select nickname into v_sender from public.players where id=NEW.invited_by_player_id;
 perform public.acs_notify_user(v_user,'Convite para equipe',coalesce(v_sender,'Um capitão')||' convidou você para '||coalesce(v_team,'uma equipe')||'.','team','teams');
 return NEW;
end; $$;
drop trigger if exists acs_notify_team_invite_insert on public.team_invites;
create trigger acs_notify_team_invite_insert after insert on public.team_invites for each row when (NEW.status='pending') execute function public.acs_notify_team_invite();

create or replace function public.acs_notify_transfer_offer()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_user uuid; v_sender text;
begin
 select user_id into v_user from public.players where id=NEW.target_player_id;
 select nickname into v_sender from public.players where id=NEW.offered_by_player_id;
 perform public.acs_notify_user(v_user,'Nova proposta de transferência',coalesce(v_sender,'Uma equipe')||' enviou uma proposta de transferência.','market','market');
 return NEW;
end; $$;
drop trigger if exists acs_notify_transfer_offer_insert on public.transfer_offers;
create trigger acs_notify_transfer_offer_insert after insert on public.transfer_offers for each row execute function public.acs_notify_transfer_offer();

create or replace function public.acs_notify_match_schedule()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_player record; v_when text;
begin
 if NEW.status='scheduled' and NEW.played_at is not null and (TG_OP='INSERT' or OLD.played_at is distinct from NEW.played_at or OLD.status is distinct from NEW.status) then
  v_when:=to_char(NEW.played_at at time zone 'America/Sao_Paulo','DD/MM/YYYY "às" HH24:MI');
  for v_player in select distinct p.user_id from public.team_members tm join public.players p on p.id=tm.player_id
   where p.user_id is not null and tm.team_id in (NEW.team_a_id,NEW.team_b_id)
  loop
   perform public.acs_notify_user(v_player.user_id,'Partida agendada',coalesce(NEW.team_a_name,'Equipe A')||' vs '||coalesce(NEW.team_b_name,'Equipe B')||' — '||v_when,'match','matches');
  end loop;
 end if;
 return NEW;
end; $$;
drop trigger if exists acs_notify_match_schedule_insert on public.matches;
create trigger acs_notify_match_schedule_insert after insert or update of played_at,status on public.matches for each row execute function public.acs_notify_match_schedule();

create or replace function public.acs_notify_economy_transaction()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_user uuid; v_team_name text; v_title text;
begin
 if NEW.direction='credit' and NEW.wallet_type='player' and NEW.player_id is not null then
  select user_id into v_user from public.players where id=NEW.player_id;
  v_title:=case NEW.transaction_type when 'salary_payment' then 'Salário recebido' when 'player_transfer' then 'Transferência recebida' else 'Movimentação na carteira' end;
  perform public.acs_notify_user(v_user,v_title,coalesce(NEW.description,'Um crédito foi adicionado à sua carteira.')||' · $'||to_char(NEW.amount,'FM999999990.00'),'economy','economy');
 elsif NEW.wallet_type='team' and NEW.team_id is not null and NEW.transaction_type='tournament_prize' then
  select name into v_team_name from public.teams where id=NEW.team_id;
  perform public.acs_notify_user(p.user_id,'Premiação recebida',coalesce(v_team_name,'Sua equipe')||' recebeu uma premiação de $'||to_char(NEW.amount,'FM999999990.00')||'.','economy','economy')
   from public.team_members tm join public.players p on p.id=tm.player_id where tm.team_id=NEW.team_id and p.user_id is not null;
 end if;
 return NEW;
end; $$;
drop trigger if exists acs_notify_economy_transaction_insert on public.economy_transactions;
create trigger acs_notify_economy_transaction_insert after insert on public.economy_transactions for each row execute function public.acs_notify_economy_transaction();

create or replace function public.acs_notify_registration_status()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_user uuid; v_team text; v_tournament text;
begin
 if TG_OP='UPDATE' and OLD.status is distinct from NEW.status then
  select p.user_id,t.name into v_user,v_team from public.teams t left join public.players p on p.id=t.captain_player_id where t.id=NEW.team_id;
  select name into v_tournament from public.tournaments where id=NEW.tournament_id;
  perform public.acs_notify_user(v_user,'Inscrição atualizada',coalesce(v_team,'Sua equipe')||': a inscrição em '||coalesce(v_tournament,'um campeonato')||' foi atualizada para "'||NEW.status||'".','tournament','tournaments');
 end if;
 return NEW;
end; $$;
drop trigger if exists acs_notify_registration_status_update on public.tournament_registrations;
create trigger acs_notify_registration_status_update after update of status on public.tournament_registrations for each row execute function public.acs_notify_registration_status();

revoke all on function public.acs_notify_team_invite() from public,anon,authenticated;
revoke all on function public.acs_notify_transfer_offer() from public,anon,authenticated;
revoke all on function public.acs_notify_match_schedule() from public,anon,authenticated;
revoke all on function public.acs_notify_economy_transaction() from public,anon,authenticated;
revoke all on function public.acs_notify_registration_status() from public,anon,authenticated;

create or replace function public.acs_admin_schedule_match(p_team_a_id uuid,p_team_b_id uuid,p_played_at timestamptz,p_best_of integer default 1)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid; v_a text; v_b text;
begin
 if not coalesce(public.acs_is_admin(),false) then raise exception 'Apenas administradores podem agendar partidas.'; end if;
 if p_team_a_id is null or p_team_b_id is null or p_team_a_id=p_team_b_id then raise exception 'Selecione duas equipes diferentes.'; end if;
 if p_played_at is null or p_played_at<=now() then raise exception 'A data da partida precisa estar no futuro.'; end if;
 if p_best_of not in (1,3,5) then raise exception 'Formato inválido. Use MD1, MD3 ou MD5.'; end if;
 select name into v_a from public.teams where id=p_team_a_id;
 select name into v_b from public.teams where id=p_team_b_id;
 if v_a is null or v_b is null then raise exception 'Uma das equipes não foi encontrada.'; end if;
 insert into public.matches(tournament_id,played_at,team_a_name,team_b_name,status,best_of,team_a_id,team_b_id,notes)
 values(null,p_played_at,v_a,v_b,'scheduled',p_best_of,p_team_a_id,p_team_b_id,'Partida agendada pela administração.')
 returning id into v_id;
 return v_id;
end; $$;
revoke all on function public.acs_admin_schedule_match(uuid,uuid,timestamptz,integer) from public,anon;
grant execute on function public.acs_admin_schedule_match(uuid,uuid,timestamptz,integer) to authenticated;

create table if not exists public.acs_player_rating_history(
 id bigint generated always as identity primary key,
 player_id uuid not null references public.players(id) on delete cascade,
 rating_am numeric not null check(rating_am>=0 and rating_am<=100),
 recorded_at timestamptz not null default now()
);
create index if not exists acs_player_rating_history_player_time_idx on public.acs_player_rating_history(player_id,recorded_at desc);
alter table public.acs_player_rating_history enable row level security;
drop policy if exists "Public can read rating history" on public.acs_player_rating_history;
create policy "Public can read rating history" on public.acs_player_rating_history for select to anon,authenticated using(true);
revoke all on table public.acs_player_rating_history from public,anon,authenticated;
grant select on table public.acs_player_rating_history to anon,authenticated;

create or replace function public.acs_record_rating_history()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 if TG_OP='INSERT' or OLD.rating_am is distinct from NEW.rating_am then
  if NEW.rating_am is not null then insert into public.acs_player_rating_history(player_id,rating_am) values(NEW.player_id,NEW.rating_am); end if;
 end if;
 return NEW;
end; $$;
revoke all on function public.acs_record_rating_history() from public,anon,authenticated;
drop trigger if exists acs_player_rating_history_trigger on public.player_competitive_stats;
create trigger acs_player_rating_history_trigger after insert or update of rating_am on public.player_competitive_stats for each row execute function public.acs_record_rating_history();
insert into public.acs_player_rating_history(player_id,rating_am,recorded_at)
select pcs.player_id,pcs.rating_am,coalesce(pcs.updated_at,now()) from public.player_competitive_stats pcs
where pcs.rating_am is not null and not exists(select 1 from public.acs_player_rating_history h where h.player_id=pcs.player_id);
