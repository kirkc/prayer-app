-- Super admin: a third role tier above admin. Super admins keep every admin
-- power and additionally get the operations dashboard (/admin/ops), the
-- ability to edit any member's settings, and requester management. The role
-- is never grantable from the UI — only a migration (or manual service-role
-- SQL) can assign it.

alter table public.profiles drop constraint profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check
  check (role in ('prayer', 'admin', 'super_admin'));

-- Promote the sole super admin. No-op in environments where this user
-- doesn't exist. Role writes remain service-role-only (migrations 003/004
-- exclude `role` from the authenticated UPDATE grant), so nothing else needs
-- to change here.
update public.profiles p
set role = 'super_admin'
from auth.users u
where u.id = p.id
  and lower(u.email) = 'castro.kirk@gmail.com';
