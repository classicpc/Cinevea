ALTER TABLE locations
  ADD COLUMN IF NOT EXISTS provider text,
  ADD COLUMN IF NOT EXISTS provider_id text,
  ADD COLUMN IF NOT EXISTS latitude numeric,
  ADD COLUMN IF NOT EXISTS longitude numeric;

ALTER TABLE movies
  ADD COLUMN IF NOT EXISTS provider text,
  ADD COLUMN IF NOT EXISTS provider_id text;

ALTER TABLE theatres
  ADD COLUMN IF NOT EXISTS provider text,
  ADD COLUMN IF NOT EXISTS provider_id text;

ALTER TABLE showtimes
  ADD COLUMN IF NOT EXISTS provider text,
  ADD COLUMN IF NOT EXISTS provider_id text,
  ADD COLUMN IF NOT EXISTS booking_url text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_locations_provider_id
  ON locations(provider, provider_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_movies_provider_id
  ON movies(provider, provider_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_theatres_provider_id
  ON theatres(provider, provider_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_showtimes_provider_id
  ON showtimes(provider, provider_id);
