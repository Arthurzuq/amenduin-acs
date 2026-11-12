-- ACS 9.1: allow black as a standard player nickname color.
alter table public.players drop constraint if exists players_profile_name_color_check;
alter table public.players add constraint players_profile_name_color_check
check (profile_name_color = any (array['yellow','white','gray','black']));