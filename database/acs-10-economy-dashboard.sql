-- ACS 10.0: uma consulta consistente e autenticada para a página de Economia.
-- SECURITY INVOKER mantém todas as políticas RLS existentes em vigor.
create or replace function public.economy_get_dashboard()
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public, auth, pg_temp
as $function$
declare
  v_uid uuid := auth.uid();
  v_player_id uuid;
  v_nickname text;
  v_wallet_balance numeric(14,2) := 0;
  v_team_id uuid;
  v_team_name text;
  v_team_role text;
  v_is_admin boolean := false;
  v_can_manage_team boolean := false;
  v_treasury_balance numeric(14,2) := 0;
  v_own_contract jsonb := null;
  v_members jsonb := '[]'::jsonb;
  v_team_history jsonb := '[]'::jsonb;
  v_personal_history jsonb := '[]'::jsonb;
begin
  if v_uid is null then
    raise exception using errcode = '28000', message = 'Sessão não autenticada.';
  end if;

  select p.id, p.nickname
    into v_player_id, v_nickname
  from public.players p
  where p.user_id = v_uid
  limit 1;

  if v_player_id is null then
    raise exception using errcode = 'P0002',
      message = 'Sua conta autenticada não possui um perfil de jogador vinculado.';
  end if;

  select coalesce((
    select w.balance
    from public.player_wallets w
    where w.player_id = v_player_id
  ), 0)
  into v_wallet_balance;

  select tm.team_id, t.name, tm.role
    into v_team_id, v_team_name, v_team_role
  from public.team_members tm
  join public.teams t on t.id = tm.team_id
  where tm.player_id = v_player_id
  order by case when tm.role = 'captain' then 0 else 1 end, tm.team_id
  limit 1;

  v_is_admin := coalesce(public.acs_is_admin(), false);
  v_can_manage_team := (v_team_id is not null and (v_team_role = 'captain' or v_is_admin));

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'transaction_type', h.transaction_type,
        'direction', h.direction,
        'amount', h.amount,
        'description', h.description,
        'created_at', h.created_at
      ) order by h.created_at desc
    ),
    '[]'::jsonb
  )
  into v_personal_history
  from (
    select et.transaction_type, et.direction, et.amount, et.description, et.created_at
    from public.economy_transactions et
    where et.wallet_type = 'player'
      and et.player_id = v_player_id
    order by et.created_at desc
    limit 30
  ) h;

  if v_team_id is not null then
    select jsonb_build_object(
      'weekly_salary', c.weekly_salary,
      'active', c.active
    )
    into v_own_contract
    from public.team_salary_contracts c
    where c.team_id = v_team_id
      and c.player_id = v_player_id;

    if v_can_manage_team then
      select coalesce((
        select a.salary_balance
        from public.team_economy_accounts a
        where a.team_id = v_team_id
      ), 0)
      into v_treasury_balance;

      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'player_id', p.id,
            'nickname', p.nickname,
            'weekly_salary', coalesce(c.weekly_salary, 0),
            'active', coalesce(c.active, false)
          ) order by p.nickname
        ),
        '[]'::jsonb
      )
      into v_members
      from public.team_members tm
      join public.players p on p.id = tm.player_id
      left join public.team_salary_contracts c
        on c.team_id = tm.team_id and c.player_id = tm.player_id
      where tm.team_id = v_team_id;

      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'transaction_type', h.transaction_type,
            'direction', h.direction,
            'amount', h.amount,
            'description', h.description,
            'created_at', h.created_at
          ) order by h.created_at desc
        ),
        '[]'::jsonb
      )
      into v_team_history
      from (
        select et.transaction_type, et.direction, et.amount, et.description, et.created_at
        from public.economy_transactions et
        where et.wallet_type = 'team'
          and et.team_id = v_team_id
        order by et.created_at desc
        limit 30
      ) h;
    end if;
  end if;

  return jsonb_build_object(
    'player', jsonb_build_object(
      'id', v_player_id,
      'nickname', v_nickname,
      'wallet_balance', v_wallet_balance
    ),
    'team', case when v_team_id is null then null else jsonb_build_object(
      'id', v_team_id,
      'name', v_team_name,
      'role', v_team_role,
      'can_manage', v_can_manage_team,
      'treasury_balance', case when v_can_manage_team then v_treasury_balance else null end,
      'own_contract', v_own_contract,
      'members', v_members,
      'history', v_team_history
    ) end,
    'personal_history', v_personal_history,
    'is_admin', v_is_admin
  );
end;
$function$;

revoke all on function public.economy_get_dashboard() from public;
revoke all on function public.economy_get_dashboard() from anon;
grant execute on function public.economy_get_dashboard() to authenticated;

comment on function public.economy_get_dashboard() is
'Returns the authenticated player wallet and role-scoped team economy snapshot using the caller JWT and existing RLS policies.';

notify pgrst, 'reload schema';