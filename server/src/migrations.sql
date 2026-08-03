-- AgriVerse Rover — Supabase schema (rover control only)
-- Run in the SQL Editor: https://rloyoohhscufexcacchj.supabase.co
--
-- ── This script cannot destroy anything ─────────────────────────
-- It contains no DROP, DELETE, TRUNCATE or ALTER of any existing object.
-- Every statement is either CREATE ... IF NOT EXISTS, or guarded by a check
-- that the object is missing first. Running it twice is a no-op.
--
-- ── Scope ───────────────────────────────────────────────────────
-- One table: the rover roster. That is the whole of what controlling a rover
-- needs from a database — a MAC address, a name, and who owns it. Everything
-- else the rover does (driving, sensors, camera, display) is live traffic
-- through the relay and is deliberately never written here.
--
-- The name is prefixed `rover_` so it cannot collide with tables already in
-- this project, and so it is obvious what to remove when this logic moves to
-- its own site.

CREATE TABLE IF NOT EXISTS rover_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- References auth.users directly rather than a profiles table, so this
  -- schema stands alone and does not assume anything about what else lives
  -- in this project.
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  mac_address TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  -- One pairing per MAC per user. The relay routes by MAC, so a duplicate
  -- would make routing ambiguous.
  UNIQUE (user_id, mac_address)
);

ALTER TABLE rover_devices ENABLE ROW LEVEL SECURITY;

/*
  Policies are created only if absent.

  Deliberately not `DROP POLICY IF EXISTS` then `CREATE`: that pattern is
  fine on a table you own outright, but this project has other data in it and
  a dropped policy is a security hole for however long the transaction takes
  to recreate it. Checking first touches nothing that already exists.
*/
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'rover_devices'
      AND policyname = 'rover_devices_select_own'
  ) THEN
    CREATE POLICY rover_devices_select_own
      ON rover_devices FOR SELECT USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'rover_devices'
      AND policyname = 'rover_devices_insert_own'
  ) THEN
    CREATE POLICY rover_devices_insert_own
      ON rover_devices FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;

  -- Renaming a rover.
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'rover_devices'
      AND policyname = 'rover_devices_update_own'
  ) THEN
    CREATE POLICY rover_devices_update_own
      ON rover_devices FOR UPDATE USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'rover_devices'
      AND policyname = 'rover_devices_delete_own'
  ) THEN
    CREATE POLICY rover_devices_delete_own
      ON rover_devices FOR DELETE USING (auth.uid() = user_id);
  END IF;
END $$;

-- Every query the app makes is "my rovers", so this is the lookup that runs.
CREATE INDEX IF NOT EXISTS rover_devices_user_id_idx ON rover_devices(user_id);
