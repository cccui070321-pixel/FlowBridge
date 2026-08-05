-- FlowBridge v0.3 platform upgrade.
-- Additive migration: preserves all v0.2 users, devices, clipboard items and events.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null default '',
  display_name text not null default '',
  avatar_path text,
  bio text not null default '' check (char_length(bio) <= 280),
  locale text not null default 'zh-CN',
  timezone text not null default 'Asia/Shanghai',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  theme text not null default 'system' check (theme in ('system','light','dark')),
  accent text not null default 'blue' check (accent in ('blue','indigo','teal','orange','rose','graphite')),
  font_scale numeric(3,2) not null default 1.00 check (font_scale in (0.90,1.00,1.10,1.25)),
  density text not null default 'comfortable' check (density in ('comfortable','compact')),
  sidebar_order jsonb not null default '["home","clipboard","files","prompts","storage","devices"]'::jsonb,
  home_widgets jsonb not null default '["quick-send","devices","recent","storage"]'::jsonb,
  default_target_device_id uuid references public.devices(id) on delete set null,
  notification_policy jsonb not null default '{"text":true,"file":true,"device":true,"quota":true,"preview":false}'::jsonb,
  retention_policy jsonb not null default '{"clipboardDays":30,"transferDays":7,"trashDays":30}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'user' check (role in ('user','admin','super_admin')),
  granted_by uuid references auth.users(id) on delete set null,
  granted_at timestamptz not null default now()
);

create table if not exists public.user_admin_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  account_status text not null default 'active' check (account_status in ('active','suspended','deletion_pending')),
  internal_note text not null default '',
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.storage_quotas (
  user_id uuid primary key references auth.users(id) on delete cascade,
  quota_bytes bigint not null default 2147483648 check (quota_bytes between 104857600 and 1099511627776),
  used_bytes_cached bigint not null default 0 check (used_bytes_cached >= 0),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.storage_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  transfer_id uuid references public.transfers(id) on delete set null,
  storage_key text not null unique,
  original_name text not null check (char_length(original_name) between 1 and 255),
  mime_type text not null default 'application/octet-stream',
  size_bytes bigint not null check (size_bytes between 0 and 524288000),
  sha256 text not null check (char_length(sha256) = 64),
  category text not null default 'other' check (category in ('image','video','document','archive','other')),
  retention_type text not null default 'temporary' check (retention_type in ('temporary','saved')),
  expires_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id) on delete set null,
  target_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  resource_type text not null,
  resource_id text,
  reason text not null default '',
  metadata_redacted jsonb not null default '{}'::jsonb,
  result text not null default 'success' check (result in ('success','failed')),
  created_at timestamptz not null default now()
);

alter table public.transfers add column if not exists bytes_transferred bigint not null default 0;
alter table public.transfers add column if not exists upload_session_id text;
alter table public.transfers add column if not exists retry_count integer not null default 0;
alter table public.transfers add column if not exists last_error_code text;
alter table public.transfers add column if not exists received_at timestamptz;
alter table public.transfers add column if not exists updated_at timestamptz not null default now();

alter table public.devices add column if not exists device_fingerprint_hash text;
alter table public.devices add column if not exists last_app_version text;
alter table public.devices add column if not exists revoked_by uuid references auth.users(id) on delete set null;
alter table public.devices add column if not exists revoked_reason text;

create index if not exists storage_items_owner_created_idx on public.storage_items(owner_id, created_at desc);
create index if not exists storage_items_owner_active_idx on public.storage_items(owner_id, deleted_at, expires_at);
create index if not exists audit_logs_created_idx on public.audit_logs(created_at desc);
create index if not exists audit_logs_target_idx on public.audit_logs(target_user_id, created_at desc);

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = auth.uid() and role in ('admin','super_admin')
  );
$$;

create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = auth.uid() and role = 'super_admin'
  );
$$;

create or replace function public.is_account_active()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select account_status = 'active'
    from public.user_admin_state where user_id = auth.uid()
  ), true);
$$;

revoke all on function public.is_platform_admin() from public;
revoke all on function public.is_super_admin() from public;
revoke all on function public.is_account_active() from public;
grant execute on function public.is_platform_admin() to authenticated;
grant execute on function public.is_super_admin() to authenticated;
grant execute on function public.is_account_active() to authenticated;

create or replace function public.handle_flowbridge_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles(id, email, display_name)
  values (new.id, coalesce(new.email, ''), coalesce(split_part(new.email, '@', 1), 'FlowBridge 用户'))
  on conflict (id) do update set email = excluded.email;
  insert into public.user_preferences(user_id) values (new.id) on conflict do nothing;
  insert into public.user_roles(user_id, role) values (new.id, 'user') on conflict do nothing;
  insert into public.user_admin_state(user_id) values (new.id) on conflict do nothing;
  insert into public.storage_quotas(user_id) values (new.id) on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_flowbridge on auth.users;
create trigger on_auth_user_flowbridge
after insert or update of email on auth.users
for each row execute function public.handle_flowbridge_user();

insert into public.profiles(id, email, display_name, created_at)
select id, coalesce(email, ''), coalesce(split_part(email, '@', 1), 'FlowBridge 用户'), created_at
from auth.users on conflict (id) do update set email = excluded.email;
insert into public.user_preferences(user_id) select id from auth.users on conflict do nothing;
insert into public.user_roles(user_id, role) select id, 'user' from auth.users on conflict do nothing;
insert into public.user_admin_state(user_id) select id from auth.users on conflict do nothing;
insert into public.storage_quotas(user_id) select id from auth.users on conflict do nothing;

create or replace function public.refresh_storage_usage()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare affected_user uuid;
begin
  affected_user := coalesce(new.owner_id, old.owner_id);
  update public.storage_quotas
  set used_bytes_cached = coalesce((
    select sum(size_bytes) from public.storage_items
    where owner_id = affected_user and deleted_at is null
  ), 0), updated_at = now()
  where user_id = affected_user;
  return coalesce(new, old);
end;
$$;

drop trigger if exists storage_usage_changed on public.storage_items;
create trigger storage_usage_changed
after insert or update of size_bytes, deleted_at or delete on public.storage_items
for each row execute function public.refresh_storage_usage();

alter table public.profiles enable row level security;
alter table public.user_preferences enable row level security;
alter table public.user_roles enable row level security;
alter table public.user_admin_state enable row level security;
alter table public.storage_quotas enable row level security;
alter table public.storage_items enable row level security;
alter table public.audit_logs enable row level security;

create policy profiles_read on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_platform_admin());
create policy profiles_insert_self on public.profiles for insert to authenticated
  with check (id = auth.uid());
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

create policy preferences_owner on public.user_preferences for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy roles_read on public.user_roles for select to authenticated
  using (user_id = auth.uid() or public.is_platform_admin());
create policy admin_state_read on public.user_admin_state for select to authenticated
  using (user_id = auth.uid() or public.is_platform_admin());
create policy quotas_read on public.storage_quotas for select to authenticated
  using (user_id = auth.uid() or public.is_platform_admin());
create policy storage_items_owner_or_admin_read on public.storage_items for select to authenticated
  using (owner_id = auth.uid() or public.is_platform_admin());
create policy storage_items_owner_insert on public.storage_items for insert to authenticated
  with check (owner_id = auth.uid() and public.is_account_active());
create policy storage_items_owner_update on public.storage_items for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid() and public.is_account_active());
create policy storage_items_owner_delete on public.storage_items for delete to authenticated
  using (owner_id = auth.uid());
create policy audit_admin_read on public.audit_logs for select to authenticated
  using (public.is_platform_admin());

create policy devices_active_account on public.devices as restrictive for all to authenticated
  using (public.is_account_active()) with check (public.is_account_active());
create policy projects_active_account on public.projects as restrictive for all to authenticated
  using (public.is_account_active()) with check (public.is_account_active());
create policy clipboard_active_account on public.clipboard_items as restrictive for all to authenticated
  using (public.is_account_active()) with check (public.is_account_active());
create policy transfers_active_account on public.transfers as restrictive for all to authenticated
  using (public.is_account_active()) with check (public.is_account_active());
create policy prompts_active_account on public.prompts as restrictive for all to authenticated
  using (public.is_account_active()) with check (public.is_account_active());
create policy sync_events_active_account on public.sync_events as restrictive for all to authenticated
  using (public.is_account_active()) with check (public.is_account_active());
create policy storage_objects_active_account on storage.objects as restrictive for all to authenticated
  using (public.is_account_active()) with check (public.is_account_active());

revoke update on public.profiles from authenticated;
grant update(display_name, avatar_path, bio, locale, timezone, updated_at) on public.profiles to authenticated;

create or replace function public.write_admin_audit(
  p_target_user_id uuid,
  p_action text,
  p_resource_type text,
  p_resource_id text,
  p_reason text,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.audit_logs(actor_id, target_user_id, action, resource_type, resource_id, reason, metadata_redacted)
  values (auth.uid(), p_target_user_id, p_action, p_resource_type, p_resource_id, p_reason, p_metadata);
end;
$$;
revoke all on function public.write_admin_audit(uuid,text,text,text,text,jsonb) from public;

create or replace function public.admin_set_account_status(p_user_id uuid, p_status text, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare old_status text;
begin
  if not public.is_platform_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  if p_status not in ('active','suspended','deletion_pending') then raise exception 'INVALID_STATUS'; end if;
  select account_status into old_status from public.user_admin_state where user_id = p_user_id;
  insert into public.user_admin_state(user_id, account_status, updated_by, updated_at)
  values (p_user_id, p_status, auth.uid(), now())
  on conflict (user_id) do update set account_status = excluded.account_status, updated_by = auth.uid(), updated_at = now();
  perform public.write_admin_audit(p_user_id, 'account.status.changed', 'user', p_user_id::text, p_reason,
    jsonb_build_object('old', old_status, 'new', p_status));
end;
$$;

create or replace function public.admin_set_storage_quota(p_user_id uuid, p_quota_bytes bigint, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare old_quota bigint;
begin
  if not public.is_platform_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  if p_quota_bytes < 104857600 or p_quota_bytes > 1099511627776 then raise exception 'INVALID_QUOTA'; end if;
  select quota_bytes into old_quota from public.storage_quotas where user_id = p_user_id;
  insert into public.storage_quotas(user_id, quota_bytes, updated_by, updated_at)
  values (p_user_id, p_quota_bytes, auth.uid(), now())
  on conflict (user_id) do update set quota_bytes = excluded.quota_bytes, updated_by = auth.uid(), updated_at = now();
  perform public.write_admin_audit(p_user_id, 'storage.quota.changed', 'quota', p_user_id::text, p_reason,
    jsonb_build_object('old', old_quota, 'new', p_quota_bytes));
end;
$$;

create or replace function public.admin_set_user_role(p_user_id uuid, p_role text, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare old_role text;
begin
  if not public.is_super_admin() then raise exception 'SUPER_ADMIN_REQUIRED'; end if;
  if p_role not in ('user','admin','super_admin') then raise exception 'INVALID_ROLE'; end if;
  select role into old_role from public.user_roles where user_id = p_user_id;
  insert into public.user_roles(user_id, role, granted_by, granted_at)
  values (p_user_id, p_role, auth.uid(), now())
  on conflict (user_id) do update set role = excluded.role, granted_by = auth.uid(), granted_at = now();
  perform public.write_admin_audit(p_user_id, 'user.role.changed', 'role', p_user_id::text, p_reason,
    jsonb_build_object('old', old_role, 'new', p_role));
end;
$$;

create or replace function public.admin_revoke_user_devices(p_user_id uuid, p_reason text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare affected integer;
begin
  if not public.is_platform_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  update public.devices set revoked_at = now(), revoked_by = auth.uid(), revoked_reason = p_reason
  where user_id = p_user_id and revoked_at is null;
  get diagnostics affected = row_count;
  perform public.write_admin_audit(p_user_id, 'devices.revoked', 'device', null, p_reason,
    jsonb_build_object('count', affected));
  return affected;
end;
$$;

create or replace function public.admin_list_users()
returns table (
  user_id uuid,
  email text,
  display_name text,
  account_status text,
  role text,
  created_at timestamptz,
  last_sign_in_at timestamptz,
  device_count bigint,
  storage_used bigint,
  storage_quota bigint
)
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not public.is_platform_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  return query
  select u.id, coalesce(u.email,''), coalesce(p.display_name,''), coalesce(s.account_status,'active'),
    coalesce(r.role,'user'), u.created_at, u.last_sign_in_at,
    (select count(*) from public.devices d where d.user_id = u.id and d.revoked_at is null),
    coalesce(q.used_bytes_cached,0), coalesce(q.quota_bytes,2147483648)
  from auth.users u
  left join public.profiles p on p.id = u.id
  left join public.user_admin_state s on s.user_id = u.id
  left join public.user_roles r on r.user_id = u.id
  left join public.storage_quotas q on q.user_id = u.id
  order by u.created_at desc;
end;
$$;

revoke all on function public.admin_set_account_status(uuid,text,text) from public;
revoke all on function public.admin_set_storage_quota(uuid,bigint,text) from public;
revoke all on function public.admin_set_user_role(uuid,text,text) from public;
revoke all on function public.admin_revoke_user_devices(uuid,text) from public;
revoke all on function public.admin_list_users() from public;
grant execute on function public.admin_set_account_status(uuid,text,text) to authenticated;
grant execute on function public.admin_set_storage_quota(uuid,bigint,text) to authenticated;
grant execute on function public.admin_set_user_role(uuid,text,text) to authenticated;
grant execute on function public.admin_revoke_user_devices(uuid,text) to authenticated;
grant execute on function public.admin_list_users() to authenticated;

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'transfers') then
    alter publication supabase_realtime add table public.transfers;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'storage_items') then
    alter publication supabase_realtime add table public.storage_items;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'user_preferences') then
    alter publication supabase_realtime add table public.user_preferences;
  end if;
end $$;

-- Bootstrap the first Super Admin manually in the Supabase SQL editor after this migration:
-- update public.user_roles set role = 'super_admin' where user_id = '<YOUR_AUTH_USER_UUID>';
