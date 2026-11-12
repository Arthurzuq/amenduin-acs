alter table public.players
  add column if not exists profile_name_style text not null default 'default',
  add column if not exists profile_frame_style text not null default 'default',
  add column if not exists profile_background_style text not null default 'default';

alter table public.teams
  add column if not exists name_style text not null default 'default',
  add column if not exists frame_style text not null default 'default',
  add column if not exists background_style text not null default 'default';

create table if not exists public.acs_cosmetic_unlocks (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope in ('player','team')),
  owner_id uuid not null,
  item_key text not null,
  price numeric(12,2) not null check (price >= 0),
  purchased_by uuid not null references auth.users(id) on delete cascade,
  purchased_at timestamptz not null default now(),
  unique(scope, owner_id, item_key)
);
alter table public.acs_cosmetic_unlocks enable row level security;
revoke all on public.acs_cosmetic_unlocks from public, anon, authenticated;
grant select on public.acs_cosmetic_unlocks to authenticated;
drop policy if exists "Users can view owned cosmetics" on public.acs_cosmetic_unlocks;
create policy "Users can view owned cosmetics"
on public.acs_cosmetic_unlocks for select to authenticated
using (
  (scope='player' and exists (select 1 from public.players p where p.id=owner_id and p.user_id=(select auth.uid())))
  or
  (scope='team' and exists (select 1 from public.team_members tm join public.players p on p.id=tm.player_id where tm.team_id=owner_id and p.user_id=(select auth.uid())))
  or (select public.acs_is_admin())
);

alter table public.economy_transactions drop constraint if exists economy_transactions_transaction_type_check;
alter table public.economy_transactions add constraint economy_transactions_transaction_type_check
check (transaction_type = any (array['weekly_grant','salary_payment','tournament_prize','player_transfer','cosmetic_purchase']));

create or replace function public.acs_purchase_cosmetic(p_scope text,p_team_id uuid,p_item_key text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_user uuid := auth.uid(); v_owner uuid; v_slot text; v_tier text;
  v_price numeric(12,2); v_balance numeric(12,2); v_exists boolean := false;
  v_valid_keys text[] := array['name_solid_crimson','name_solid_azure','name_solid_emerald','name_solid_violet','name_solid_gold','name_gradient_sunset','name_gradient_ocean','name_gradient_aurora','name_gradient_inferno','name_gradient_candy','name_gradient_galaxy','name_gradient_royal','name_gradient_sunrise','name_gradient_arctic','name_gradient_jungle','name_animated_chroma','name_animated_neon','frame_solid_crimson','frame_solid_azure','frame_solid_emerald','frame_solid_violet','frame_solid_gold','frame_gradient_sunset','frame_gradient_ocean','frame_gradient_aurora','frame_gradient_inferno','frame_gradient_candy','frame_gradient_galaxy','frame_gradient_royal','frame_gradient_sunrise','frame_gradient_arctic','frame_gradient_jungle','frame_animated_chroma','frame_animated_neon','background_solid_crimson','background_solid_azure','background_solid_emerald','background_solid_violet','background_solid_gold','background_gradient_sunset','background_gradient_ocean','background_gradient_aurora','background_gradient_inferno','background_gradient_candy','background_gradient_galaxy','background_gradient_royal','background_gradient_sunrise','background_gradient_arctic','background_gradient_jungle','background_animated_chroma','background_animated_neon'];
  v_ref text;
begin
  if v_user is null then raise exception 'Faça login para comprar personalizações.'; end if;
  if p_scope not in ('player','team') then raise exception 'Categoria de personalização inválida.'; end if;
  if p_item_key is null or not (p_item_key = any(v_valid_keys)) then raise exception 'Item de personalização inválido.'; end if;
  v_slot := split_part(p_item_key,'_',1); v_tier := split_part(p_item_key,'_',2);
  v_price := case v_slot
    when 'name' then case v_tier when 'solid' then 100 when 'gradient' then 600 when 'animated' then 1600 end
    when 'frame' then case v_tier when 'solid' then 150 when 'gradient' then 900 when 'animated' then 2000 end
    when 'background' then case v_tier when 'solid' then 200 when 'gradient' then 1500 when 'animated' then 2800 end
  end;
  if p_scope='player' then
    if p_team_id is not null then raise exception 'Equipe não se aplica a uma personalização de jogador.'; end if;
    select id into v_owner from public.players where user_id=v_user;
    if v_owner is null then raise exception 'Crie seu perfil de jogador antes de personalizá-lo.'; end if;
  else
    if p_team_id is null then raise exception 'Selecione uma equipe.'; end if;
    select tm.player_id into v_owner from public.team_members tm join public.players p on p.id=tm.player_id
    where tm.team_id=p_team_id and p.user_id=v_user and tm.role='captain' limit 1;
    if v_owner is null then raise exception 'Somente o capitão pode personalizar a equipe.'; end if;
    v_owner := p_team_id;
  end if;
  select exists(select 1 from public.acs_cosmetic_unlocks where scope=p_scope and owner_id=v_owner and item_key=p_item_key) into v_exists;
  if not v_exists then
    if p_scope='player' then
      select balance into v_balance from public.player_wallets where player_id=v_owner for update;
      if not found then raise exception 'Carteira do jogador não encontrada.'; end if;
    else
      insert into public.team_economy_accounts(team_id,salary_balance) values(v_owner,0) on conflict(team_id) do nothing;
      select salary_balance into v_balance from public.team_economy_accounts where team_id=v_owner for update;
    end if;
    if v_balance < v_price then raise exception 'Saldo insuficiente. Necessário: $% e disponível: $%.',v_price,v_balance; end if;
    if p_scope='player' then
      update public.player_wallets set balance=balance-v_price,updated_at=now() where player_id=v_owner;
    else
      update public.team_economy_accounts set salary_balance=salary_balance-v_price,updated_at=now() where team_id=v_owner;
    end if;
    insert into public.acs_cosmetic_unlocks(scope,owner_id,item_key,price,purchased_by) values(p_scope,v_owner,p_item_key,v_price,v_user);
    v_ref := 'cosmetic:'||p_scope||':'||v_owner::text||':'||p_item_key;
    insert into public.economy_transactions(wallet_type,team_id,player_id,transaction_type,direction,amount,description,reference_key,created_by)
    values(p_scope,case when p_scope='team' then v_owner else null end,case when p_scope='player' then v_owner else null end,'cosmetic_purchase','debit',v_price,'Compra de personalização: '||p_item_key,v_ref,v_user);
  end if;
  if p_scope='player' then
    update public.players set
      profile_name_style=case when v_slot='name' then p_item_key else profile_name_style end,
      profile_frame_style=case when v_slot='frame' then p_item_key else profile_frame_style end,
      profile_background_style=case when v_slot='background' then p_item_key else profile_background_style end,
      updated_at=now() where id=v_owner;
    select balance into v_balance from public.player_wallets where player_id=v_owner;
  else
    update public.teams set
      name_style=case when v_slot='name' then p_item_key else name_style end,
      frame_style=case when v_slot='frame' then p_item_key else frame_style end,
      background_style=case when v_slot='background' then p_item_key else background_style end where id=v_owner;
    select salary_balance into v_balance from public.team_economy_accounts where team_id=v_owner;
  end if;
  return jsonb_build_object('success',true,'purchased',not v_exists,'equipped',true,'price',case when v_exists then 0 else v_price end,'balance',v_balance,'item_key',p_item_key);
end; $$;
revoke all on function public.acs_purchase_cosmetic(text,uuid,text) from public,anon;
grant execute on function public.acs_purchase_cosmetic(text,uuid,text) to authenticated;