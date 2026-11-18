import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// OMDb has no catalog/discovery or showtimes endpoint, so we drive the sync
// from a curated title list and generate local showtimes for each movie.
const DEFAULT_TITLES = [
  "Dune: Part Two",
  "Oppenheimer",
  "Inside Out 2",
  "Deadpool & Wolverine",
  "The Batman",
  "Spider-Man: Across the Spider-Verse",
  "Wicked",
  "Gladiator II",
];

const DEFAULT_SHOWTIMES = ["12:00", "15:00", "18:00", "21:00"];
const DEFAULT_TICKET_PRICE = 14.99;
// Fixed EST offset; doesn't account for daylight saving (-04:00 in summer).
const TORONTO_UTC_OFFSET = "-05:00";

type OmdbMovie = {
  Title?: string;
  Year?: string;
  Rated?: string;
  Runtime?: string;
  Genre?: string;
  Plot?: string;
  Poster?: string;
  imdbRating?: string;
  imdbID?: string;
  Response?: string;
  Error?: string;
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await request.json().catch(() => ({}));
    const titles: string[] = Array.isArray(body.titles) && body.titles.length ? body.titles : DEFAULT_TITLES;
    const days = Number.isFinite(Number(body.days)) ? Math.min(Math.max(Number(body.days), 1), 14) : 7;
    const theatreName = String(body.theatreName || "Cinevea Downtown");
    const city = String(body.city || "Toronto");
    const country = String(body.country || "Canada");

    const apiKey = Deno.env.get("OMDB_API_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!apiKey || !supabaseUrl || !serviceRoleKey) {
      return json({ error: "OMDb or Supabase service credentials are not configured." }, 503);
    }

    const db = createClient(supabaseUrl, serviceRoleKey);

    const { data: location, error: locationError } = await db
      .from("locations")
      .upsert({
        name: city,
        city,
        country,
        provider: "local",
        provider_id: `local-${city.toLowerCase()}`,
      }, { onConflict: "provider,provider_id" })
      .select("id")
      .single();
    if (locationError) throw locationError;

    const { data: theatre, error: theatreError } = await db
      .from("theatres")
      .upsert({
        location_id: location.id,
        name: theatreName,
        provider: "local",
        provider_id: `local-${theatreName.toLowerCase().replace(/\s+/g, "-")}`,
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

    let importedMovies = 0;
    let importedShowtimes = 0;
    const errors: Array<{ title: string; error: string }> = [];

    for (const title of titles) {
      try {
        const film = await omdbRequest(title, apiKey);
        const movie = await upsertMovie(db, film);
        importedMovies++;

        for (let offset = 0; offset < days; offset++) {
          const date = new Date();
          date.setDate(date.getDate() + offset);
          const dateStr = date.toISOString().slice(0, 10);

          for (const time of DEFAULT_SHOWTIMES) {
            const providerId = `local-${theatre.id}-${film.imdbID}-${dateStr}-${time}`;
            const { error: showtimeError } = await db
              .from("showtimes")
              .upsert({
                movie_id: movie.id,
                auditorium_id: auditorium.id,
                starts_at: `${dateStr}T${time}:00${TORONTO_UTC_OFFSET}`,
                format: "2D",
                ticket_price: DEFAULT_TICKET_PRICE,
                provider: "local",
                provider_id: providerId,
              }, { onConflict: "provider,provider_id" });
            if (showtimeError) throw showtimeError;
            importedShowtimes++;
          }
        }
      } catch (error) {
        errors.push({ title, error: error instanceof Error ? error.message : String(error) });
      }
    }

    return json({
      theatre: theatreName,
      city,
      movies: importedMovies,
      showtimes: importedShowtimes,
      errors,
    }, errors.length ? 207 : 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : JSON.stringify(error);
    return json({ error: message || "OMDb sync failed." }, 500);
  }
});

async function omdbRequest(title: string, apiKey: string): Promise<OmdbMovie> {
  const baseUrl = Deno.env.get("OMDB_BASE_URL") || "https://www.omdbapi.com";
  const url = `${baseUrl}/?t=${encodeURIComponent(title)}&plot=full&apikey=${apiKey}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`OMDb HTTP ${response.status}`);
  }
  const data = (await response.json()) as OmdbMovie;
  if (data.Response === "False") {
    throw new Error(data.Error || `OMDb could not find "${title}"`);
  }
  return data;
}

function parseRuntime(runtime?: string): number | null {
  const match = runtime?.match(/(\d+)/);
  return match ? Number(match[1]) : null;
}

function parseRating(rating?: string): number | null {
  const value = Number(rating);
  return Number.isFinite(value) ? value : null;
}

async function upsertMovie(db: ReturnType<typeof createClient>, film: OmdbMovie) {
  const genre = film.Genre?.split(",")[0]?.trim() || null;
  const { data, error } = await db
    .from("movies")
    .upsert({
      title: film.Title,
      poster_url: film.Poster && film.Poster !== "N/A" ? film.Poster : null,
      genre,
      age_rating: film.Rated && film.Rated !== "N/A" ? film.Rated : null,
      runtime_minutes: parseRuntime(film.Runtime),
      synopsis: film.Plot && film.Plot !== "N/A" ? film.Plot : null,
      rating: parseRating(film.imdbRating),
      is_coming_soon: false,
      provider: "omdb",
      provider_id: film.imdbID,
    }, { onConflict: "provider,provider_id" })
    .select("id")
    .single();
  if (error) throw error;
  return data;
}

function json(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
