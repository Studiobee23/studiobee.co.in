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

-- Added for: named entries, pause/resume support.
-- Safe to re-run; existing rows keep their data and just default name='', paused_ms=0.
alter table timelog add column if not exists name text default '';
alter table timelog add column if not exists paused_ms bigint default 0;
alter table timelog add column if not exists pause_start timestamptz;

-- Added for: project tagging / sorting by project.
alter table timelog add column if not exists project text default '';
