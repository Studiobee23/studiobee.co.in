-- Adds pause/resume support to the clock-in flow — see pauseTimeEntry/resumeTimeEntry
-- in src/lib/actions/time.ts and workedMs in src/lib/datetime.ts.

alter table time_entries add column if not exists paused_at timestamptz;
alter table time_entries add column if not exists paused_seconds integer not null default 0;
