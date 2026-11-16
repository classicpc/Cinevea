import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type MovieGluCinema = {
  cinema_id: number;
  cinema_name: string;
  address?: string;
  city?: string;
  county?: string;
  postcode?: string;
  lat?: number;
  lng?: number;
};

type MovieGluFilm = {
  film_id: number;
  film_name: string;
  age_rating?: Array<{ rating?: string }>;
  film_image?: string;
  showings?: Record<string, { times?: Array<{ start_time?: string }> }>;
  version_type?: string;
};

const ONTARIO_LOCATIONS = [
  { city: "Toronto", latitude: 43.6532, longitude: -79.3832 },
  { city: "Ottawa", latitude: 45.4215, longitude: -75.6972 },
  { city: "Mississauga", latitude: 43.589, longitude: -79.6441 },
  { city: "Brampton", latitude: 43.7315, longitude: -79.7624 },
  { city: "Hamilton", latitude: 43.2557, longitude: -79.8711 },
  { city: "London", latitude: 42.9849, longitude: -81.2453 },
  { city: "Kitchener", latitude: 43.4516, longitude: -80.4925 },
  { city: "Windsor", latitude: 42.3149, longitude: -83.0364 },
  { city: "Kingston", latitude: 44.2312, longitude: -76.486 },
  { city: "Barrie", latitude: 44.3894, longitude: -79.6903 },
  { city: "Oshawa", latitude: 43.8971, longitude: -78.8658 },
  { city: "Sudbury", latitude: 46.4917, longitude: -80.993 },
];

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await request.json();
    const isOntarioBulk = String(body.province || "").toLowerCase() === "ontario";
    const latitude = Number(body.latitude ?? 43.6532);
    const longitude = Number(body.longitude ?? -79.3832);
    const city = String(body.city || "").trim();
    const country = String(body.country || "Canada").trim();
    const date = String(body.date || new Date().toISOString().slice(0, 10));
    const mode = String(body.mode || "sync");
    const filmId = Number(body.filmId);
    const requestedCinemaCount = Number(body.maxCinemas);
    const maxCinemas = Number.isFinite(requestedCinemaCount)
      ? Math.min(Math.max(Math.floor(requestedCinemaCount), 1), 25)
      : 5;
    const includePurchaseLinks = body.includePurchaseLinks === true;

    const isDetailsMode = mode === "filmDetails" || mode === "refreshMovieDetails";
    if (!isOntarioBulk && !isDetailsMode && (!Number.isFinite(latitude) || !Number.isFinite(longitude) || !city)) {
      return json({ error: "latitude, longitude, and city are required." }, 400);
    }

    const movieGlu = {
      client: Deno.env.get("MOVIEGLU_CLIENT"),
      apiKey: Deno.env.get("MOVIEGLU_API_KEY"),
      authorization: Deno.env.get("MOVIEGLU_AUTHORIZATION"),
    };
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!movieGlu.client || !movieGlu.apiKey || !movieGlu.authorization || !supabaseUrl || !serviceRoleKey) {
      return json({ error: "MovieGlu or Supabase service credentials are not configured." }, 503);
    }

    const db = createClient(supabaseUrl, serviceRoleKey);
    const headers = {
      client: movieGlu.client,
      "x-api-key": movieGlu.apiKey,
      authorization: movieGlu.authorization,
      territory: "CA",
      "api-version": "v201",
      geolocation: `${latitude};${longitude}`,
      "device-datetime": new Date().toISOString(),
    };

    if (mode === "filmDetails") {
      if (!Number.isInteger(filmId) || filmId < 1) {
        return json({ error: "A valid filmId is required." }, 400);
      }
      const details = await movieGluRequest<Record<string, unknown>>(
        `filmDetails/?film_id=${filmId}`,
        headers,
      );
      return json(details, 200);
    }

    if (mode === "refreshMovieDetails") {
      return await refreshMovieDetails(db, headers);
    }

    if (isOntarioBulk) {
      return await syncOntario(db, date, headers, maxCinemas);
    }

    const nearby = await movieGluRequest<{ cinemas?: MovieGluCinema[] }>(
      `cinemasNearby/?n=${maxCinemas}`,
      headers,
      true,
    );
    let cinemas = nearby.cinemas ?? [];
    if (!cinemas.length) {
      const searched = await movieGluRequest<{ cinemas?: MovieGluCinema[] }>(
        `cinemaLiveSearch/?query=${encodeURIComponent(city)}&n=${maxCinemas}`,
        headers,
      );
      cinemas = searched.cinemas ?? [];
    }
    cinemas = cinemas.slice(0, maxCinemas);
    let importedShowtimes = 0;
    let importedMovies = 0;

    const { data: location, error: locationError } = await db
      .from("locations")
      .upsert({
        name: city,
        city,
        country,
        latitude,
        longitude,
        provider: "movieglu",
        provider_id: `${city.toLowerCase()}-${latitude.toFixed(3)}-${longitude.toFixed(3)}`,
      }, { onConflict: "provider,provider_id" })
      .select("id")
      .single();
    if (locationError) throw locationError;

    for (const cinema of cinemas) {
      const { data: theatre, error: theatreError } = await db
        .from("theatres")
        .upsert({
          location_id: location.id,
          name: cinema.cinema_name,
          address: [cinema.address, cinema.city, cinema.postcode].filter(Boolean).join(", "),
          provider: "movieglu",
          provider_id: String(cinema.cinema_id),
        }, { onConflict: "provider,provider_id" })
        .select("id")
        .single();
      if (theatreError) throw theatreError;

      const { data: auditorium, error: auditoriumError } = await db
        .from("auditoriums")
        .upsert({
          theatre_id: theatre.id,
          name: "Main screen",
          seat_rows: 8,
          seat_columns: 12,
        }, { onConflict: "theatre_id,name" })
        .select("id")
        .single();
      if (auditoriumError) throw auditoriumError;

      const schedule = await movieGluRequest<{ films?: MovieGluFilm[] }>(
        `cinemaShowTimes/?cinema_id=${cinema.cinema_id}&date=${date}`,
        headers,
      );

      for (const film of schedule.films ?? []) {
        const poster = film.film_image || null;
        const { data: movie, error: movieError } = await db
          .from("movies")
          .upsert({
            title: film.film_name,
            poster_url: poster,
            age_rating: film.age_rating?.[0]?.rating?.trim() || null,
            provider: "movieglu",
            provider_id: String(film.film_id),
            is_coming_soon: false,
          }, { onConflict: "provider,provider_id" })
          .select("id")
          .single();
        if (movieError) throw movieError;
        importedMovies++;

        const formats = film.showings ?? {};
        for (const [format, showing] of Object.entries(formats)) {
          for (const time of showing.times ?? []) {
            if (!time.start_time) continue;
            let bookingUrl: string | null = null;
            if (includePurchaseLinks) {
              const purchase = await movieGluRequest<{ url?: string }>(
                `purchaseConfirmation/?cinema_id=${cinema.cinema_id}&film_id=${film.film_id}&date=${date}&time=${encodeURIComponent(time.start_time)}`,
                headers,
                true,
              );
              bookingUrl = purchase.url || null;
            }
            const startsAt = `${date}T${time.start_time}:00`;
            const providerId = `${cinema.cinema_id}-${film.film_id}-${date}-${time.start_time}-${format}`;
            const { error: showtimeError } = await db
              .from("showtimes")
              .upsert({
                movie_id: movie.id,
                auditorium_id: auditorium.id,
                starts_at: startsAt,
                format: format || film.version_type || "Standard",
                ticket_price: 0,
                provider: "movieglu",
                provider_id: providerId,
                booking_url: bookingUrl,
              }, { onConflict: "provider,provider_id" })
              .select("id")
              .single();
            if (showtimeError) throw showtimeError;

            importedShowtimes++;
          }
        }
      }
    }

    return json({
      city,
      date,
      cinemas: cinemas.length,
      movies: importedMovies,
      showtimes: importedShowtimes,
      purchaseLinks: includePurchaseLinks,
    }, 200);
  } catch (error) {
    if (error instanceof MovieGluError) {
      return json({ error: error.message, providerStatus: error.status }, error.status === 429 ? 429 : 502);
    }
    const message = error instanceof Error ? error.message : JSON.stringify(error);
    return json({ error: message || "MovieGlu sync failed." }, 500);
  }
});

async function refreshMovieDetails(
  db: ReturnType<typeof createClient>,
  headers: Record<string, string>,
) {
  const { data: movies, error } = await db
    .from("movies")
    .select("id,provider_id")
    .eq("provider", "movieglu")
    .not("provider_id", "is", null);
  if (error) throw error;

  let updated = 0;
  const errors: string[] = [];
  for (const movie of movies ?? []) {
    try {
      const details = await movieGluRequest<Record<string, unknown>>(
        `filmDetails/?film_id=${encodeURIComponent(movie.provider_id)}`,
        headers,
      );
      const film = (details.film as Record<string, unknown> | undefined) ?? details;
      const ageRating = Array.isArray(film.age_rating)
        ? String((film.age_rating[0] as { rating?: unknown })?.rating || "")
        : String(film.age_rating || "");
      const { error: updateError } = await db
        .from("movies")
        .update({
          title: String(film.film_name || ""),
          poster_url: film.film_image || null,
          age_rating: ageRating || null,
          runtime_minutes: Number(film.duration_mins || film.runtime) || null,
          release_date: typeof film.release_date === "string" ? film.release_date : null,
          synopsis: String(film.synopsis_long || film.synopsis || "") || null,
          rating: Number(film.review_stars) || null,
        })
        .eq("id", movie.id);
      if (updateError) throw updateError;
      updated++;
    } catch (error) {
      errors.push(`${movie.provider_id}: ${error instanceof Error ? error.message : String(error)}`);
      if (error instanceof MovieGluError && error.status === 429) break;
    }
  }
  return json({ mode: "refreshMovieDetails", found: movies?.length ?? 0, updated, errors }, errors.length ? 207 : 200);
}

async function syncOntario(
  db: ReturnType<typeof createClient>,
  date: string,
  baseHeaders: Record<string, string>,
  maxCinemas: number,
) {
  const catalogHeaders = { ...baseHeaders, geolocation: "43.6532;-79.3832" };
  const catalog = await movieGluRequest<{ films?: MovieGluFilm[] }>(
    "filmsNowShowing/",
    catalogHeaders,
  );
  let importedMovies = 0;
  for (const film of catalog.films ?? []) {
    await upsertMovie(db, film);
    importedMovies++;
  }

  let importedCinemas = 0;
  let importedShowtimes = 0;
  const errors: Array<{ city: string; error: string; providerStatus?: number }> = [];
  const cities = [];

  for (const location of ONTARIO_LOCATIONS) {
    try {
      const headers = {
        ...baseHeaders,
        geolocation: `${location.latitude};${location.longitude}`,
      };
      const nearby = await movieGluRequest<{ cinemas?: MovieGluCinema[] }>(
        `cinemasNearby/?n=${maxCinemas}`,
        headers,
        true,
      );
      let cinemas = nearby.cinemas ?? [];
      if (!cinemas.length) {
        const searched = await movieGluRequest<{ cinemas?: MovieGluCinema[] }>(
          `cinemaLiveSearch/?query=${encodeURIComponent(location.city)}&n=${maxCinemas}`,
          headers,
        );
        cinemas = searched.cinemas ?? [];
      }
      cinemas = cinemas.slice(0, maxCinemas);
      importedCinemas += cinemas.length;

      const { data: dbLocation, error: locationError } = await db
        .from("locations")
        .upsert({
          name: location.city,
          city: location.city,
          country: "Canada",
          provider: "movieglu",
          provider_id: `ontario-${location.city.toLowerCase()}`,
          latitude: location.latitude,
          longitude: location.longitude,
        }, { onConflict: "provider,provider_id" })
        .select("id")
        .single();
      if (locationError) throw locationError;

      for (const cinema of cinemas) {
        const { data: theatre, error: theatreError } = await db
          .from("theatres")
          .upsert({
            location_id: dbLocation.id,
            name: cinema.cinema_name,
            address: [cinema.address, cinema.city, cinema.postcode].filter(Boolean).join(", "),
            provider: "movieglu",
            provider_id: String(cinema.cinema_id),
          }, { onConflict: "provider,provider_id" })
          .select("id")
          .single();
        if (theatreError) throw theatreError;

        const { data: auditorium, error: auditoriumError } = await db
          .from("auditoriums")
          .upsert({
            theatre_id: theatre.id,
            name: "Main screen",
            seat_rows: 8,
            seat_columns: 12,
          }, { onConflict: "theatre_id,name" })
          .select("id")
          .single();
        if (auditoriumError) throw auditoriumError;

        const schedule = await movieGluRequest<{ films?: MovieGluFilm[] }>(
          `cinemaShowTimes/?cinema_id=${cinema.cinema_id}&date=${date}`,
          headers,
        );
        for (const film of schedule.films ?? []) {
          const movie = await upsertMovie(db, film);
          importedMovies++;
          for (const [format, showing] of Object.entries(film.showings ?? {})) {
            for (const time of showing.times ?? []) {
              if (!time.start_time) continue;
              const { error: showtimeError } = await db
                .from("showtimes")
                .upsert({
                  movie_id: movie.id,
                  auditorium_id: auditorium.id,
                  starts_at: `${date}T${time.start_time}:00`,
                  format: format || film.version_type || "Standard",
                  ticket_price: 0,
                  provider: "movieglu",
                  provider_id: `${cinema.cinema_id}-${film.film_id}-${date}-${time.start_time}-${format}`,
                  booking_url: null,
                }, { onConflict: "provider,provider_id" });
              if (showtimeError) throw showtimeError;
              importedShowtimes++;
            }
          }
        }
      }
      cities.push({ city: location.city, cinemas: cinemas.length });
    } catch (error) {
      if (error instanceof MovieGluError) {
        errors.push({ city: location.city, error: error.message, providerStatus: error.status });
        if (error.status === 429) break;
      } else {
        errors.push({ city: location.city, error: error instanceof Error ? error.message : String(error) });
      }
    }
  }

  const status = errors.length ? 207 : 200;
  return json({
    province: "Ontario",
    date,
    cities,
    cinemas: importedCinemas,
    movies: importedMovies,
    showtimes: importedShowtimes,
    errors,
    purchaseLinks: false,
  }, status);
}

async function upsertMovie(db: ReturnType<typeof createClient>, film: MovieGluFilm) {
  const { data, error } = await db
    .from("movies")
    .upsert({
      title: film.film_name,
      poster_url: film.film_image || null,
      age_rating: film.age_rating?.[0]?.rating?.trim() || null,
      provider: "movieglu",
      provider_id: String(film.film_id),
      is_coming_soon: false,
    }, { onConflict: "provider,provider_id" })
    .select("id")
    .single();
  if (error) throw error;
  return data;
}

class MovieGluError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "MovieGluError";
  }
}

async function movieGluRequest<T>(
  path: string,
  headers: Record<string, string>,
  allowNoContent = false,
): Promise<T> {
  const response = await fetch(`https://api-gate2.movieglu.com/${path}`, { headers });
  if (response.status === 204 && allowNoContent) return {} as T;
  const raw = await response.text();
  let payload: T & { status?: { message?: string } };
  try {
    payload = JSON.parse(raw);
  } catch {
    throw new MovieGluError(
      `MovieGlu returned HTTP ${response.status} with a non-JSON response.`,
      response.status,
    );
  }
  if (!response.ok) {
    throw new MovieGluError(
      payload?.status?.message || `MovieGlu request failed (${response.status}).`,
      response.status,
    );
  }
  return payload;
}

function json(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
