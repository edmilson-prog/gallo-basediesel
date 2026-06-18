-- ai_feature_enabled(feature): gating boolean for the front (attendants cannot
-- read ai_settings — it is owner-only RLS). SECURITY DEFINER reads the singleton
-- and returns ONLY master AND routing[feature].enabled AND (∃ provider configurado),
-- never keys/budget/models. Mirrors the SUPPORTED set semantics of ai-generate.
create or replace function public.ai_feature_enabled(p_feature text)
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select s.master_enabled
       and coalesce((
         select (r->>'enabled')::boolean
         from jsonb_array_elements(s.routing) r
         where r->>'feature' = p_feature
         limit 1
       ), false)
       and exists (
         select 1 from jsonb_array_elements(s.providers) p
         where p->>'status' = 'configured' and (p->>'enabled')::boolean = true
       )
    from public.ai_settings s
    where s.id = 1
  ), false);
$$;

revoke execute on function public.ai_feature_enabled(text) from public, anon;
grant execute on function public.ai_feature_enabled(text) to authenticated;
