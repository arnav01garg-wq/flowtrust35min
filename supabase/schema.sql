-- Run this in the Supabase SQL editor to enable account-specific cloud workspace sync.
-- The browser anon/publishable key is safe to expose only because RLS is enabled.
create table if not exists public.flowtrust_workspaces (
  user_id uuid primary key references auth.users(id) on delete cascade,
  workspace jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.flowtrust_workspaces enable row level security;

create policy "Users can read their own FlowTrust workspace"
  on public.flowtrust_workspaces for select
  using (auth.uid() = user_id);

create policy "Users can create their own FlowTrust workspace"
  on public.flowtrust_workspaces for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own FlowTrust workspace"
  on public.flowtrust_workspaces for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
