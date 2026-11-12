create table if not exists public.tournament_board_documents (
  tournament_id uuid primary key references public.tournaments(id) on delete cascade,
  board_json jsonb not null default '{"version":1,"nodes":[],"edges":[]}'::jsonb,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint tournament_board_documents_json_object check (jsonb_typeof(board_json) = 'object'),
  constraint tournament_board_documents_size check (pg_column_size(board_json) <= 2097152)
);

alter table public.tournament_board_documents enable row level security;
grant select on public.tournament_board_documents to anon, authenticated;
grant insert, update, delete on public.tournament_board_documents to authenticated;

drop policy if exists "Public can view tournament board documents" on public.tournament_board_documents;
create policy "Public can view tournament board documents"
  on public.tournament_board_documents for select
  to anon, authenticated using (true);

drop policy if exists "Admins insert tournament board documents" on public.tournament_board_documents;
create policy "Admins insert tournament board documents"
  on public.tournament_board_documents for insert
  to authenticated with check (public.acs_is_admin() and updated_by = auth.uid());

drop policy if exists "Admins update tournament board documents" on public.tournament_board_documents;
create policy "Admins update tournament board documents"
  on public.tournament_board_documents for update
  to authenticated
  using (public.acs_is_admin())
  with check (public.acs_is_admin() and updated_by = auth.uid());

drop policy if exists "Admins delete tournament board documents" on public.tournament_board_documents;
create policy "Admins delete tournament board documents"
  on public.tournament_board_documents for delete
  to authenticated using (public.acs_is_admin());