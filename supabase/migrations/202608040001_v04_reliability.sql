-- FlowBridge v0.4.0: reliable delivery, version compatibility and profile assets.

alter table public.devices add column if not exists protocol_version integer not null default 1;
alter table public.devices add column if not exists capabilities jsonb not null default '{}'::jsonb;
alter table public.devices add column if not exists last_realtime_at timestamptz;
alter table public.devices add column if not exists last_reconcile_at timestamptz;

alter table public.transfers add column if not exists current_stage text not null default 'queued';
alter table public.transfers add column if not exists next_retry_at timestamptz;
alter table public.transfers add column if not exists sender_ready_at timestamptz;
alter table public.transfers add column if not exists receiver_started_at timestamptz;
alter table public.transfers add column if not exists receiver_ack_at timestamptz;
alter table public.transfers add column if not exists protocol_version integer not null default 1;
alter table public.transfers add column if not exists failure_category text;

alter table public.user_preferences add column if not exists wallpaper_path text;
alter table public.user_preferences add column if not exists wallpaper_overlay numeric(4,3) not null default 0.58;
alter table public.user_preferences add column if not exists auto_receive_files boolean not null default false;
alter table public.user_preferences add column if not exists background_run boolean not null default true;
alter table public.user_preferences add column if not exists launch_at_startup boolean not null default false;
alter table public.user_preferences add column if not exists auto_update boolean not null default true;

create table if not exists public.transfer_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  transfer_id uuid not null references public.transfers(id) on delete cascade,
  device_id uuid references public.devices(id) on delete set null,
  event_type text not null,
  idempotency_key text not null,
  metadata_redacted jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (transfer_id, idempotency_key)
);

create index if not exists transfer_events_transfer_created_idx on public.transfer_events(transfer_id, created_at);
create index if not exists transfers_target_pending_idx on public.transfers(target_device_id, status, created_at)
  where status in ('uploaded', 'waiting', 'downloading', 'failed');

alter table public.transfer_events enable row level security;
drop policy if exists transfer_events_owner on public.transfer_events;
create policy transfer_events_owner on public.transfer_events for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

grant select, insert on public.transfer_events to authenticated;

create or replace function public.mark_device_reconciled(p_device_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.devices
  set last_seen_at = now(), last_reconcile_at = now()
  where id = p_device_id and user_id = auth.uid() and revoked_at is null;
end;
$$;

revoke all on function public.mark_device_reconciled(uuid) from public;
grant execute on function public.mark_device_reconciled(uuid) to authenticated;
