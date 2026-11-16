CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  city text NOT NULL,
  country text NOT NULL DEFAULT 'Canada',
  provider text,
  provider_id text,
  latitude numeric,
  longitude numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_id)
);

CREATE TABLE IF NOT EXISTS movies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  poster_url text,
  genre text,
  language text,
  runtime_minutes integer CHECK (runtime_minutes > 0),
  age_rating text,
  release_date date,
  synopsis text,
  rating numeric(3,1) CHECK (rating IS NULL OR rating BETWEEN 0 AND 10),
  is_coming_soon boolean NOT NULL DEFAULT false,
  provider text,
  provider_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_id)
);

CREATE TABLE IF NOT EXISTS theatres (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  name text NOT NULL,
  address text,
  provider text,
  provider_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_id)
);

CREATE TABLE IF NOT EXISTS auditoriums (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  theatre_id uuid NOT NULL REFERENCES theatres(id) ON DELETE CASCADE,
  name text NOT NULL,
  seat_rows integer NOT NULL CHECK (seat_rows > 0),
  seat_columns integer NOT NULL CHECK (seat_columns > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (theatre_id, name)
);

CREATE TABLE IF NOT EXISTS showtimes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  movie_id uuid NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
  auditorium_id uuid NOT NULL REFERENCES auditoriums(id) ON DELETE CASCADE,
  starts_at timestamptz NOT NULL,
  format text NOT NULL DEFAULT '2D',
  language text,
  ticket_price numeric(10,2) NOT NULL CHECK (ticket_price >= 0),
  provider text,
  provider_id text,
  booking_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS showtime_seats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  showtime_id uuid NOT NULL REFERENCES showtimes(id) ON DELETE CASCADE,
  row_label text NOT NULL,
  seat_number integer NOT NULL CHECK (seat_number > 0),
  status text NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'held', 'booked')),
  hold_token uuid,
  hold_expires_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (showtime_id, row_label, seat_number)
);

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'confirmed'
    CHECK (status IN ('confirmed', 'cancelled')),
  ADD COLUMN IF NOT EXISTS showtime_id uuid REFERENCES showtimes(id),
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;

CREATE TABLE IF NOT EXISTS seat_holds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  showtime_id uuid NOT NULL REFERENCES showtimes(id) ON DELETE CASCADE,
  hold_token uuid NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_theatres_location ON theatres(location_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_auditoriums_theatre_name ON auditoriums(theatre_id, name);
CREATE INDEX IF NOT EXISTS idx_showtimes_movie_start ON showtimes(movie_id, starts_at);
CREATE INDEX IF NOT EXISTS idx_showtime_seats_lookup ON showtime_seats(showtime_id, status);
CREATE INDEX IF NOT EXISTS idx_seat_holds_expiry ON seat_holds(expires_at);

ALTER TABLE locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE movies ENABLE ROW LEVEL SECURITY;
ALTER TABLE theatres ENABLE ROW LEVEL SECURITY;
ALTER TABLE auditoriums ENABLE ROW LEVEL SECURITY;
ALTER TABLE showtimes ENABLE ROW LEVEL SECURITY;
ALTER TABLE showtime_seats ENABLE ROW LEVEL SECURITY;
ALTER TABLE seat_holds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_read_locations" ON locations;
CREATE POLICY "authenticated_read_locations" ON locations FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "authenticated_read_movies" ON movies;
CREATE POLICY "authenticated_read_movies" ON movies FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "authenticated_read_theatres" ON theatres;
CREATE POLICY "authenticated_read_theatres" ON theatres FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "authenticated_read_auditoriums" ON auditoriums;
CREATE POLICY "authenticated_read_auditoriums" ON auditoriums FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "authenticated_read_showtimes" ON showtimes;
CREATE POLICY "authenticated_read_showtimes" ON showtimes FOR SELECT TO authenticated USING (starts_at > now());
DROP POLICY IF EXISTS "authenticated_read_seats" ON showtime_seats;
CREATE POLICY "authenticated_read_seats" ON showtime_seats FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "owner_read_holds" ON seat_holds;
CREATE POLICY "owner_read_holds" ON seat_holds FOR SELECT TO authenticated USING (auth.uid() = user_id);

GRANT SELECT ON locations, movies, theatres, auditoriums, showtimes, showtime_seats TO authenticated;
GRANT SELECT ON seat_holds TO authenticated;

CREATE OR REPLACE FUNCTION release_expired_holds()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE showtime_seats
  SET status = 'available', hold_token = NULL, hold_expires_at = NULL, updated_at = now()
  WHERE status = 'held' AND hold_expires_at <= now();
  DELETE FROM seat_holds WHERE expires_at <= now();
END;
$$;

CREATE OR REPLACE FUNCTION reserve_showtime_seats(
  p_showtime_id uuid,
  p_seats jsonb,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hold_token uuid := gen_random_uuid();
  v_expires_at timestamptz := now() + interval '5 minutes';
  v_existing seat_holds;
  v_seat jsonb;
  v_count integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  PERFORM release_expired_holds();

  SELECT sh.* INTO v_existing
  FROM seat_holds sh
  WHERE sh.user_id = auth.uid()
    AND sh.showtime_id = p_showtime_id
    AND sh.hold_token::text = p_idempotency_key
    AND sh.expires_at > now()
  FOR UPDATE;
  IF FOUND THEN
    RETURN jsonb_build_object('hold_token', v_existing.hold_token, 'expires_at', v_existing.expires_at);
  END IF;

  FOR v_seat IN SELECT * FROM jsonb_array_elements(p_seats)
  LOOP
    UPDATE showtime_seats
    SET status = 'held', hold_token = v_hold_token, hold_expires_at = v_expires_at, updated_at = now()
    WHERE showtime_id = p_showtime_id
      AND row_label = v_seat->>'row'
      AND seat_number = (v_seat->>'number')::integer
      AND status = 'available';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'One or more selected seats are no longer available';
    END IF;
    v_count := v_count + 1;
  END LOOP;

  IF v_count = 0 THEN RAISE EXCEPTION 'At least one seat is required'; END IF;
  INSERT INTO seat_holds(user_id, showtime_id, hold_token, expires_at)
  VALUES (auth.uid(), p_showtime_id, v_hold_token, v_expires_at);
  RETURN jsonb_build_object('hold_token', v_hold_token, 'expires_at', v_expires_at);
END;
$$;

GRANT EXECUTE ON FUNCTION reserve_showtime_seats(uuid, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION release_expired_holds() TO authenticated;

CREATE OR REPLACE FUNCTION confirm_held_booking(
  p_hold_token uuid,
  p_booking_ref text,
  p_movie_title text,
  p_movie_genre text,
  p_movie_rating text,
  p_ticket_count integer,
  p_total_price numeric
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hold seat_holds;
  v_booking_id uuid;
  v_showtime showtimes;
  v_movie movies;
  v_seats text[];
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  PERFORM release_expired_holds();
  SELECT * INTO v_hold FROM seat_holds
  WHERE hold_token = p_hold_token AND user_id = auth.uid() AND expires_at > now()
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Reservation is missing or expired'; END IF;

  SELECT * INTO v_showtime FROM showtimes WHERE id = v_hold.showtime_id FOR SHARE;
  SELECT * INTO v_movie FROM movies WHERE id = v_showtime.movie_id FOR SHARE;
  IF v_showtime.id IS NULL OR v_movie.id IS NULL THEN RAISE EXCEPTION 'Showtime is no longer available'; END IF;
  SELECT array_agg(row_label || seat_number::text) INTO v_seats
  FROM showtime_seats
  WHERE showtime_id = v_hold.showtime_id AND hold_token = p_hold_token;
  IF v_seats IS NULL OR cardinality(v_seats) = 0 THEN RAISE EXCEPTION 'Reserved seats are no longer available'; END IF;

  UPDATE showtime_seats
  SET status = 'booked', hold_token = NULL, hold_expires_at = NULL, updated_at = now()
  WHERE showtime_id = v_hold.showtime_id AND hold_token = p_hold_token;
  IF NOT FOUND THEN RAISE EXCEPTION 'Reserved seats are no longer available'; END IF;

  INSERT INTO bookings (
    user_id, booking_ref, movie_title, movie_genre, movie_rating,
    show_date, showtime, ticket_count, seats, total_price, status, showtime_id
  )
  SELECT auth.uid(), p_booking_ref, p_movie_title, p_movie_genre, p_movie_rating,
    (v_showtime.starts_at AT TIME ZONE 'UTC')::date,
    to_char(v_showtime.starts_at AT TIME ZONE 'UTC', 'HH12:MI AM'),
    p_ticket_count,
    v_seats,
    p_total_price, 'confirmed', v_hold.showtime_id
  RETURNING id INTO v_booking_id;

  DELETE FROM seat_holds WHERE id = v_hold.id;
  RETURN v_booking_id;
END;
$$;

CREATE OR REPLACE FUNCTION cancel_booking(p_booking_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking bookings;
BEGIN
  SELECT * INTO v_booking FROM bookings
  WHERE id = p_booking_id AND user_id = auth.uid() AND status = 'confirmed'
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Booking is not eligible for cancellation'; END IF;
  UPDATE bookings SET status = 'cancelled', cancelled_at = now() WHERE id = p_booking_id;
  UPDATE showtime_seats
  SET status = 'available', updated_at = now()
  WHERE showtime_id = v_booking.showtime_id AND status = 'booked'
    AND row_label || seat_number::text = ANY(v_booking.seats);
END;
$$;

GRANT EXECUTE ON FUNCTION confirm_held_booking(uuid, text, text, text, text, integer, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION cancel_booking(uuid) TO authenticated;
