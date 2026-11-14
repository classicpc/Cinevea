/*
# Create bookings table for Cinevea

1. Purpose
   Stores movie ticket bookings made by authenticated users through
   the Cinevea voice/text booking assistant. Each row represents one
   completed booking with movie details, date, showtime, seats, and
   a generated booking ID.

2. New Tables
   - `bookings`
     - `id` (uuid, primary key)
     - `user_id` (uuid, references auth.users, cascading delete)
     - `booking_ref` (text, unique human-readable booking ID like "CV-ABCD1234")
     - `movie_title` (text, name of the movie)
     - `movie_genre` (text, genre of the movie)
     - `movie_rating` (text, motion picture rating)
     - `show_date` (date, the selected screening date)
     - `showtime` (text, the selected showtime string)
     - `ticket_count` (integer, number of tickets)
     - `seats` (text[], array of seat labels like ["A5","A6"])
     - `total_price` (numeric, total cost)
     - `created_at` (timestamptz, default now())

3. Security
   - Enable RLS on `bookings`.
   - Grant CRUD to `authenticated` only (app requires sign-in).
   - Owner-scoped policies: each authenticated user can only
     SELECT, INSERT, UPDATE, DELETE their own bookings.
   - `user_id` defaults to `auth.uid()` so inserts from the frontend
     that omit the column still satisfy the INSERT policy.
*/

CREATE TABLE IF NOT EXISTS bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  booking_ref text UNIQUE NOT NULL,
  movie_title text NOT NULL,
  movie_genre text NOT NULL,
  movie_rating text NOT NULL,
  show_date date NOT NULL,
  showtime text NOT NULL,
  ticket_count integer NOT NULL CHECK (ticket_count > 0 AND ticket_count <= 10),
  seats text[] NOT NULL DEFAULT '{}',
  total_price numeric(10,2) NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON bookings TO authenticated;

DROP POLICY IF EXISTS "select_own_bookings" ON bookings;
CREATE POLICY "select_own_bookings"
  ON bookings FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_bookings" ON bookings;
CREATE POLICY "insert_own_bookings"
  ON bookings FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_bookings" ON bookings;
CREATE POLICY "update_own_bookings"
  ON bookings FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_bookings" ON bookings;
CREATE POLICY "delete_own_bookings"
  ON bookings FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Index for quick lookup by user
CREATE INDEX IF NOT EXISTS idx_bookings_user_id ON bookings(user_id);
