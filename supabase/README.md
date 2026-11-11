# Supabase — histórico ACS

As migrações ACS 5.0 em `migrations/` correspondem aos seguintes registros do projeto remoto:

- `20261111160749_acs_5_playoff_builder_and_cloud_drafts`
- `20261111161720_acs_5_fix_champion_bye_propagation`
- `20261111162609_acs_5_require_group_results_before_playoffs`

Elas já foram aplicadas no projeto `mzdkfmhexrdhercsbmlo`. Não as execute novamente nesse ambiente. Os arquivos foram incluídos no repositório para manter o histórico técnico e apoiar instalações novas após a conferência do estado do banco.

A configuração do projeto que roda no navegador permanece no arquivo `supabase-config.js` da raiz e deve conter exclusivamente URL e publishable/anon key. Segredos e `service_role` nunca devem ser versionados no frontend.
