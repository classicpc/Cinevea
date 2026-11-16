CREATE OR REPLACE FUNCTION seed_showtime_seats()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows integer;
  v_columns integer;
BEGIN
  SELECT seat_rows, seat_columns INTO v_rows, v_columns
  FROM auditoriums
  WHERE id = NEW.auditorium_id;

  INSERT INTO showtime_seats (showtime_id, row_label, seat_number)
  SELECT NEW.id, chr(64 + row_num.row_number), seat_num.seat_number
  FROM generate_series(1, v_rows) AS row_num(row_number)
  CROSS JOIN generate_series(1, v_columns) AS seat_num(seat_number)
  ON CONFLICT (showtime_id, row_label, seat_number) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS seed_showtime_seats_after_insert ON showtimes;
CREATE TRIGGER seed_showtime_seats_after_insert
AFTER INSERT ON showtimes
FOR EACH ROW EXECUTE FUNCTION seed_showtime_seats();

INSERT INTO showtime_seats (showtime_id, row_label, seat_number)
SELECT s.id, chr(64 + rows.row_number), columns.seat_number
FROM showtimes s
JOIN auditoriums a ON a.id = s.auditorium_id
CROSS JOIN LATERAL generate_series(1, a.seat_rows) AS rows(row_number)
CROSS JOIN LATERAL generate_series(1, a.seat_columns) AS columns(seat_number)
ON CONFLICT (showtime_id, row_label, seat_number) DO NOTHING;
