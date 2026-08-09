-- AgriVerse Rover — console schema.
--
-- What this database is *for*: the relay is stateless and forgets everything the
-- moment a board disconnects, so anything you want to look at tomorrow has to be
-- written down as it goes past. Live control never touches Postgres — the drive
-- path stays socket-only, because a 25Hz stick stream through a database would
-- add latency to the one thing that cannot afford any.
--
-- Identity note: this system has no passwords. The relay treats the connection's
-- token *as* the user id, so `owner_id` here is a plain text column rather than a
-- reference to auth.users. RLS is written against a request header instead, which
-- is stated honestly below rather than dressed up as authentication.

create extension if not exists "pgcrypto";

/* ── rovers ─────────────────────────────────────────────────────────── */

create table if not exists public.rovers (
  id           uuid primary key default gen_random_uuid(),
  owner_id     text        not null,
  name         text        not null,
  mac_address  text        not null,
  -- Free-text grouping. A "cluster" in the phone app is just a label, and
  -- modelling it as a table bought nothing but a join.
  cluster      text,
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  -- One rover per MAC per owner. Two people may legitimately register the same
  -- board (a shared machine), so the constraint is on the pair, not the MAC.
  constraint rovers_owner_mac_key unique (owner_id, mac_address),
  constraint rovers_mac_format check (mac_address ~ '^([0-9A-F]{2}:){5}[0-9A-F]{2}$')
);

create index if not exists rovers_owner_idx on public.rovers (owner_id, created_at desc);

/* ── telemetry ──────────────────────────────────────────────────────── */

-- Readings are an open key→number map on the wire, and they stay open here.
-- A jsonb column means adding a sensor to the hub needs no migration, which is
-- the whole reason the wire format was designed that way.
create table if not exists public.telemetry_samples (
  id          bigint generated always as identity primary key,
  rover_id    uuid        not null references public.rovers (id) on delete cascade,
  owner_id    text        not null,
  readings    jsonb       not null,
  -- Which board reported it. A rover can carry more than one sensor source.
  source_mac  text,
  recorded_at timestamptz not null default now(),

  constraint telemetry_readings_is_object check (jsonb_typeof(readings) = 'object')
);

-- The only query this table serves: one rover's recent history, newest first.
create index if not exists telemetry_rover_time_idx
  on public.telemetry_samples (rover_id, recorded_at desc);

/* ── drive sessions ─────────────────────────────────────────────────── */

create table if not exists public.drive_sessions (
  id          uuid primary key default gen_random_uuid(),
  rover_id    uuid        not null references public.rovers (id) on delete cascade,
  owner_id    text        not null,
  started_at  timestamptz not null default now(),
  ended_at    timestamptz,
  -- Counted client-side and written once at the end. Writing a row per command
  -- would put a database round trip inside the drive loop.
  command_count integer   not null default 0,
  peak_throttle real      not null default 0,

  constraint drive_peak_range check (peak_throttle >= 0 and peak_throttle <= 1.5)
);

create index if not exists drive_sessions_rover_idx
  on public.drive_sessions (rover_id, started_at desc);

/* ── housekeeping ───────────────────────────────────────────────────── */

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists rovers_touch_updated_at on public.rovers;
create trigger rovers_touch_updated_at
  before update on public.rovers
  for each row execute function public.touch_updated_at();

/* ── row level security ─────────────────────────────────────────────── */

-- Read this before trusting it.
--
-- These policies scope every row to the identity the client sends in the
-- `x-rover-owner` header. That is *isolation between users*, not authentication:
-- a caller who supplies someone else's identity gets their rows, exactly as they
-- would on the relay, which accepts the same string as its token.
--
-- The security boundary for this system is possession of the identity string. If
-- that is not good enough for your deployment, the fix is Supabase Auth and
-- `auth.uid()` in place of the header below — the table shapes do not change.

alter table public.rovers            enable row level security;
alter table public.telemetry_samples enable row level security;
alter table public.drive_sessions    enable row level security;

-- PostgREST exposes the request's headers as one JSON GUC; there is no
-- per-header setting, so the value is dug out of that. `true` on
-- current_setting keeps this from throwing when called outside a request
-- (a psql session, a migration), where it correctly returns null and matches
-- nothing.
create or replace function public.current_owner()
returns text
language sql
stable
set search_path = ''
as $$
  select nullif(
    coalesce(
      current_setting('request.headers', true)::json ->> 'x-rover-owner',
      ''
    ),
    ''
  )
$$;

drop policy if exists rovers_owner_rw on public.rovers;
create policy rovers_owner_rw on public.rovers
  for all
  using (owner_id = public.current_owner())
  with check (owner_id = public.current_owner());

drop policy if exists telemetry_owner_rw on public.telemetry_samples;
create policy telemetry_owner_rw on public.telemetry_samples
  for all
  using (owner_id = public.current_owner())
  with check (owner_id = public.current_owner());

drop policy if exists drive_owner_rw on public.drive_sessions;
create policy drive_owner_rw on public.drive_sessions
  for all
  using (owner_id = public.current_owner())
  with check (owner_id = public.current_owner());

/* ── retention ──────────────────────────────────────────────────────── */

-- Telemetry accumulates at roughly one row per rover per second while a console
-- is open. Left alone that is ~86k rows/day/rover, so trimming is not optional.
-- Schedule with pg_cron if available:
--   select cron.schedule('trim-telemetry', '0 4 * * *',
--                        $$select public.trim_telemetry(30)$$);
create or replace function public.trim_telemetry(keep_days integer default 30)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  removed bigint;
begin
  delete from public.telemetry_samples
   where recorded_at < now() - make_interval(days => keep_days);
  get diagnostics removed = row_count;
  return removed;
end;
$$;
