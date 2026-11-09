-- Execute this migration once in Supabase SQL Editor after the original schema.

-- ACS 3.0: player-to-player transfer proposals.
-- Run this section in the Supabase SQL Editor after the original schema.
create table if not exists public.transfer_offers (
  id uuid primary key default gen_random_uuid(),
  target_player_id uuid not null references public.players(id) on delete cascade,
  offered_by_player_id uuid not null references public.players(id) on delete cascade,
  message varchar(500),
  status text not null default 'pending' check (status in ('pending','accepted','rejected','cancelled')),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  constraint transfer_offer_distinct_players check (target_player_id <> offered_by_player_id)
);

alter table public.transfer_offers enable row level security;
drop policy if exists "Participants can view their transfer offers" on public.transfer_offers;
create policy "Participants can view their transfer offers" on public.transfer_offers
  for select to authenticated using (
    exists (select 1 from public.players p where p.id = target_player_id and p.user_id = auth.uid())
    or exists (select 1 from public.players p where p.id = offered_by_player_id and p.user_id = auth.uid())
  );
drop policy if exists "Players can send transfer offers" on public.transfer_offers;
create policy "Players can send transfer offers" on public.transfer_offers
  for insert to authenticated with check (
    exists (select 1 from public.players p where p.id = offered_by_player_id and p.user_id = auth.uid())
    and exists (
      select 1 from public.players p
      where p.id = target_player_id
        and p.market_status in ('Disponível','Negociável','Livre','Em negociação')
    )
    and target_player_id <> offered_by_player_id
    and status = 'pending'
  );
drop policy if exists "Participants can update transfer offers" on public.transfer_offers;
create policy "Participants can update transfer offers" on public.transfer_offers
  for update to authenticated using (
    exists (select 1 from public.players p where p.id = target_player_id and p.user_id = auth.uid())
    or exists (select 1 from public.players p where p.id = offered_by_player_id and p.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.players p where p.id = target_player_id and p.user_id = auth.uid())
    or (status = 'cancelled' and exists (select 1 from public.players p where p.id = offered_by_player_id and p.user_id = auth.uid()))
  );

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
drop trigger if exists trg_guard_transfer_offer_update on public.transfer_offers;
create trigger trg_guard_transfer_offer_update before update on public.transfer_offers
  for each row execute function public.guard_transfer_offer_update();

create or replace function public.apply_accepted_transfer_offer()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  new_team text;
  old_team text;
  proposer_user uuid;
begin
  if old.status = 'pending' and new.status = 'accepted' then
    select team_name, user_id into new_team, proposer_user
      from public.players where id = new.offered_by_player_id;
    select team_name into old_team from public.players where id = new.target_player_id;
    if new_team is not null and new_team <> '' and new_team <> 'Sem equipe' then
      update public.players set team_name = new_team, market_status = 'Intocável', updated_at = now()
        where id = new.target_player_id;
      insert into public.transfers(player_id, from_team, to_team, status, proposed_by, decided_at)
        values (new.target_player_id, old_team, new_team, 'accepted', proposer_user, now());
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_apply_accepted_transfer_offer on public.transfer_offers;
create trigger trg_apply_accepted_transfer_offer after update on public.transfer_offers
  for each row execute function public.apply_accepted_transfer_offer();

create index if not exists idx_transfer_offers_target on public.transfer_offers(target_player_id, created_at desc);
create index if not exists idx_transfer_offers_proposer on public.transfer_offers(offered_by_player_id, created_at desc);

create unique index if not exists idx_transfer_offers_one_pending_pair
  on public.transfer_offers(target_player_id, offered_by_player_id) where status = 'pending';
