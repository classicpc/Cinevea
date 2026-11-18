CREATE TABLE IF NOT EXISTS ticket_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  label text NOT NULL,
  price_multiplier numeric(4,2) NOT NULL DEFAULT 1.00 CHECK (price_multiplier > 0),
  sort_order integer NOT NULL DEFAULT 0
);

INSERT INTO ticket_types (code, label, price_multiplier, sort_order) VALUES
  ('adult',   'Adult',            1.00, 1),
  ('senior',  'Senior (65+)',     0.80, 2),
  ('child',   'Child (under 12)', 0.70, 3),
  ('student', 'Student',          0.85, 4)
ON CONFLICT (code) DO NOTHING;

ALTER TABLE ticket_types ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_read_ticket_types" ON ticket_types;
CREATE POLICY "authenticated_read_ticket_types" ON ticket_types FOR SELECT TO authenticated USING (true);
GRANT SELECT ON ticket_types TO authenticated;

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS ticket_breakdown jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN bookings.ticket_breakdown IS 'Per ticket-type counts, keyed by ticket_types.code';

DROP FUNCTION IF EXISTS confirm_held_booking(uuid, text, text, text, text, integer, numeric);

CREATE OR REPLACE FUNCTION confirm_held_booking(
  p_hold_token uuid,
  p_booking_ref text,
  p_movie_title text,
  p_movie_genre text,
  p_movie_rating text,
  p_ticket_breakdown jsonb,
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
  v_ticket_count integer;
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

  SELECT COALESCE(SUM((value)::integer), 0) INTO v_ticket_count
  FROM jsonb_each_text(p_ticket_breakdown);
  IF v_ticket_count < 1 THEN RAISE EXCEPTION 'At least one ticket is required'; END IF;

  UPDATE showtime_seats
  SET status = 'booked', hold_token = NULL, hold_expires_at = NULL, updated_at = now()
  WHERE showtime_id = v_hold.showtime_id AND hold_token = p_hold_token;
  IF NOT FOUND THEN RAISE EXCEPTION 'Reserved seats are no longer available'; END IF;

  INSERT INTO bookings (
    user_id, booking_ref, movie_title, movie_genre, movie_rating,
    show_date, showtime, ticket_count, ticket_breakdown, seats, total_price, status, showtime_id
  )
  SELECT auth.uid(), p_booking_ref, p_movie_title, p_movie_genre, p_movie_rating,
    (v_showtime.starts_at AT TIME ZONE 'UTC')::date,
    to_char(v_showtime.starts_at AT TIME ZONE 'UTC', 'HH12:MI AM'),
    v_ticket_count,
    p_ticket_breakdown,
    v_seats,
    p_total_price, 'confirmed', v_hold.showtime_id
  RETURNING id INTO v_booking_id;

  DELETE FROM seat_holds WHERE id = v_hold.id;
  RETURN v_booking_id;
END;
$$;

GRANT EXECUTE ON FUNCTION confirm_held_booking(uuid, text, text, text, text, jsonb, numeric) TO authenticated;
