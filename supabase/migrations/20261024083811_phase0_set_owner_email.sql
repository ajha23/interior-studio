update public.org_invites i
set email = 'studio-owner@example.test'
from public.organizations o
where i.org_id = o.id and o.slug = 'interior-studio' and i.role = 'owner' and i.accepted_at is null
  and i.email = 'founder@example.test';;
