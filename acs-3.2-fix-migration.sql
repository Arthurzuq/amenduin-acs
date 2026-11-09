-- ACS 3.2 — correções de equipes e transferências
-- Execute uma vez no Supabase SQL Editor, depois das migrations 3.0 e 3.1.

-- Corrige instalações em que a coluna capacity não foi criada pela migration 3.1.
alter table public.teams
  add column if not exists capacity integer not null default 5;

alter table public.teams
  drop constraint if exists teams_capacity_check;
alter table public.teams
  add constraint teams_capacity_check check (capacity between 2 and 10);

-- Mantém uma capacidade padrão e um capitão coerente para equipes já existentes.
update public.teams set capacity = 5 where capacity is null or capacity < 2 or capacity > 10;

-- Ao aceitar uma proposta, o jogador passa para a equipe do proponente.
-- Se o proponente não tiver equipe, o jogador fica livre (Sem equipe),
-- e a movimentação ainda é registrada no histórico.
create or replace function public.apply_accepted_transfer_offer()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  destination_team text;
  previous_team text;
  proposer_user uuid;
  destination_team_id uuid;
  destination_capacity integer;
  destination_count integer;
begin
  if old.status = 'pending' and new.status = 'accepted' then
    select coalesce(nullif(trim(team_name), ''), 'Sem equipe'), user_id
      into destination_team, proposer_user
      from public.players where id = new.offered_by_player_id;

    select coalesce(nullif(trim(team_name), ''), 'Sem equipe')
      into previous_team from public.players where id = new.target_player_id;

    -- Se a equipe do proponente existir no cadastro de equipes, validar vaga.
    select id, capacity into destination_team_id, destination_capacity
      from public.teams where name = destination_team limit 1;

    if destination_team_id is not null then
      select count(*) into destination_count
        from public.team_members where team_id = destination_team_id
          and player_id <> new.target_player_id;
      if destination_count >= destination_capacity then
        raise exception 'A equipe de destino está cheia.';
      end if;

      delete from public.team_members where player_id = new.target_player_id;
      insert into public.team_members(team_id, player_id, role)
        values(destination_team_id, new.target_player_id, 'member')
        on conflict (player_id) do update
          set team_id = excluded.team_id, role = 'member', joined_at = now();
    else
      -- Sem equipe cadastrada como destino: libera o jogador e remove vínculo antigo.
      delete from public.team_members where player_id = new.target_player_id;
      destination_team := 'Sem equipe';
    end if;

    update public.players
      set team_name = destination_team,
          market_status = case when destination_team = 'Sem equipe' then 'Livre' else 'Intocável' end,
          updated_at = now()
      where id = new.target_player_id;

    insert into public.transfers(player_id, from_team, to_team, status, proposed_by, decided_at)
      values(new.target_player_id, previous_team, destination_team, 'accepted', proposer_user, now());
  end if;
  return new;
end;
$$;

-- Índices para acelerar listagem de equipes e propostas.
create index if not exists idx_team_members_team_player on public.team_members(team_id, player_id);
create index if not exists idx_transfer_offers_created on public.transfer_offers(created_at desc);
