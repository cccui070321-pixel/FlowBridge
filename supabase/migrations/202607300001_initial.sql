-- FlowBridge MVP schema. Run with `supabase db push` or paste into the SQL editor.
create extension if not exists pgcrypto;

create table public.devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  platform text not null check (platform in ('Windows', 'macOS', 'Linux')),
  app_version text not null default '0.1.0',
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  description text not null default '',
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.clipboard_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_device_id uuid not null references public.devices(id) on delete cascade,
  target_device_id uuid not null references public.devices(id) on delete cascade,
  content_type text not null check (content_type in ('text', 'prompt', 'url')),
  content text not null check (octet_length(content) <= 1048576),
  content_hash text not null,
  is_favorite boolean not null default false,
  expires_at timestamptz not null default (now() + interval '30 days'),
  created_at timestamptz not null default now()
);

create index clipboard_dedupe_lookup
  on public.clipboard_items(user_id, source_device_id, target_device_id, content_hash, created_at desc);

create table public.transfers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_device_id uuid not null references public.devices(id) on delete cascade,
  target_device_id uuid not null references public.devices(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  file_name text not null,
  file_size bigint not null check (file_size between 0 and 524288000),
  mime_type text not null default 'application/octet-stream',
  storage_key text not null,
  checksum text,
  status text not null default 'queued' check (status in ('queued','uploading','uploaded','waiting','downloading','completed','cancelled','expired','failed','checksum_failed')),
  expires_at timestamptz not null default (now() + interval '7 days'),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table public.prompts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  source_device_id uuid not null references public.devices(id) on delete cascade,
  parent_prompt_id uuid references public.prompts(id) on delete set null,
  title text not null check (char_length(title) between 1 and 200),
  content text not null,
  model_name text,
  parameters jsonb not null default '{}'::jsonb,
  notes text not null default '',
  tags text[] not null default '{}',
  is_favorite boolean not null default false,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.sync_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_device_id uuid not null references public.devices(id) on delete cascade,
  target_device_id uuid not null references public.devices(id) on delete cascade,
  event_type text not null check (event_type in ('clipboard.created','file.ready','file.received','transfer.failed','device.updated')),
  payload_ref uuid,
  status text not null default 'pending' check (status in ('pending','delivered','acknowledged','failed')),
  expires_at timestamptz not null default (now() + interval '30 days'),
  created_at timestamptz not null default now(),
  acknowledged_at timestamptz
);

create index devices_user_seen_idx on public.devices(user_id, last_seen_at desc) where revoked_at is null;
create index clipboard_user_created_idx on public.clipboard_items(user_id, created_at desc);
create index transfers_user_created_idx on public.transfers(user_id, created_at desc);
create index prompts_search_idx on public.prompts using gin (to_tsvector('simple', title || ' ' || content));
create index sync_events_target_pending_idx on public.sync_events(target_device_id, created_at) where status = 'pending';

alter table public.devices enable row level security;
alter table public.projects enable row level security;
alter table public.clipboard_items enable row level security;
alter table public.transfers enable row level security;
alter table public.prompts enable row level security;
alter table public.sync_events enable row level security;

create policy devices_owner_all on public.devices for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy projects_owner_all on public.projects for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy clipboard_owner_all on public.clipboard_items for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy transfers_owner_all on public.transfers for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy prompts_owner_all on public.prompts for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy events_owner_all on public.sync_events for all using (user_id = auth.uid()) with check (user_id = auth.uid());

insert into storage.buckets (id, name, public, file_size_limit)
values ('flowbridge-files', 'flowbridge-files', false, 524288000)
on conflict (id) do update set public = false, file_size_limit = 524288000;

create policy flowbridge_storage_select on storage.objects for select
  using (bucket_id = 'flowbridge-files' and (storage.foldername(name))[1] = auth.uid()::text);
create policy flowbridge_storage_insert on storage.objects for insert
  with check (bucket_id = 'flowbridge-files' and (storage.foldername(name))[1] = auth.uid()::text);
create policy flowbridge_storage_update on storage.objects for update
  using (bucket_id = 'flowbridge-files' and (storage.foldername(name))[1] = auth.uid()::text);
create policy flowbridge_storage_delete on storage.objects for delete
  using (bucket_id = 'flowbridge-files' and (storage.foldername(name))[1] = auth.uid()::text);

alter publication supabase_realtime add table public.devices;
alter publication supabase_realtime add table public.sync_events;

create or replace function public.heartbeat_device(p_device_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.devices set last_seen_at = now()
  where id = p_device_id and user_id = auth.uid() and revoked_at is null;
  if not found then raise exception 'DEVICE_REVOKED'; end if;
end;
$$;

revoke all on function public.heartbeat_device(uuid) from public;
grant execute on function public.heartbeat_device(uuid) to authenticated;
