-- Move from header identity to real authentication.
--
-- 0001 scoped rows by an `x-rover-owner` request header. That isolated users
-- from each other but authenticated nobody: the header is chosen by the client,
-- so anyone who learned another person's identity string could send it and read
-- their rows. It was written down as a known limitation; this migration removes
-- it.
--
-- Identity is now the Supabase Auth user. `auth.uid()` is read from a signed
-- JWT that the client cannot forge, so a request either carries a valid session
-- or sees nothing at all.
--
-- Safe to run on the existing tables: shapes do not change, only the policies
-- and a default. Any rows written under the old header scheme whose `owner_id`
-- is not a real user id become invisible — intended, since nothing verified who
-- wrote them.

/* ── profiles ───────────────────────────────────────────────────────── */

-- auth.users is managed by Supabase and should not be written to directly, so
-- anything the app wants to know about a person lives here.
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  avatar_url  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists profiles_self_read on public.profiles;
create policy profiles_self_read on public.profiles
  for select using (id = auth.uid());

drop policy if exists profiles_self_write on public.profiles;
create policy profiles_self_write on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists profiles_self_insert on public.profiles;
create policy profiles_self_insert on public.profiles
  for insert with check (id = auth.uid());

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

/*
  A profile row per user, created as the account is.

  Doing this in a trigger rather than from the client means it exists before the
  first page render — a client-side insert races the redirect back from an OAuth
  provider, and loses often enough to matter.

  Google returns the display name and picture in raw_user_meta_data under keys
  that differ from the ones an email signup sends, so both spellings are checked.
*/
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'display_name',
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      split_part(new.email, '@', 1)
    ),
    coalesce(
      new.raw_user_meta_data ->> 'avatar_url',
      new.raw_user_meta_data ->> 'picture'
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

/* ── re-scope the rover tables to the authenticated user ────────────── */

-- Filled from the session rather than trusted from the request body, so a
-- client cannot insert a row owned by somebody else even by accident.
alter table public.rovers            alter column owner_id set default auth.uid()::text;
alter table public.telemetry_samples alter column owner_id set default auth.uid()::text;
alter table public.drive_sessions    alter column owner_id set default auth.uid()::text;

-- Kept as text rather than migrated to uuid: the column is compared, never
-- joined, and rewriting the type would force a lock on the telemetry table for
-- no functional gain.
create or replace function public.current_owner()
returns text
language sql
stable
set search_path = ''
as $$
  select nullif(auth.uid()::text, '')
$$;

comment on function public.current_owner() is
  'The authenticated user, as text. Reads auth.uid() from the request JWT — '
  'no longer the client-supplied x-rover-owner header removed in 0002.';

-- The policies themselves already delegate to current_owner(), so redefining it
-- above re-points all three. Restated here so this file is readable on its own.
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

/*
  An anonymous request now resolves current_owner() to null, and `owner_id =
  null` is null rather than true, so every policy denies. That is the intended
  end state: no session, no rows.
*/
