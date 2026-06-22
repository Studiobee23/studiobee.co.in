-- StudioBee Time Log — Supabase Schema
-- Run this in the Supabase SQL Editor

create table if not exists timelog (
  id uuid primary key default gen_random_uuid(),
  note text default '',
  clock_in timestamptz not null default now(),
  clock_out timestamptz,
  created_at timestamptz default now()
);

alter table timelog enable row level security;

create policy "service role full access" on timelog for all using (true);
