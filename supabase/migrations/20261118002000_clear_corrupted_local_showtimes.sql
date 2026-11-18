-- One-time cleanup: early sync-omdb runs generated showtime provider_id values
-- that didn't include the theatre, so every city's sync collided on the same
-- (provider, provider_id) and overwrote a single set of rows. Clear them so
-- the corrected sync-omdb function (which scopes provider_id per theatre)
-- can repopulate cleanly per city.
DELETE FROM showtimes WHERE provider = 'local';
