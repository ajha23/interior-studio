-- The studio owner signs in with this Google account.
update public.org_invites i
set email = 'vinay.jha.445@gmail.com'
from public.organizations o
where i.org_id = o.id and o.slug = 'interior-studio' and i.role = 'owner' and i.accepted_at is null
  and i.email = 'akhilesh.jha.445@gmail.com';
