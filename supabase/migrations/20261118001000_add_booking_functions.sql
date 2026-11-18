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

GRANT EXECUTE ON FUNCTION reserve_showtime_seats(uuid, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION release_expired_holds() TO authenticated;
GRANT EXECUTE ON FUNCTION confirm_held_booking(uuid, text, text, text, text, jsonb, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION cancel_booking(uuid) TO authenticated;
