import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_maps";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claims?.claims?.sub) {
      return json({ error: "Unauthorized" }, 401);
    }
    const userId = claims.claims.sub as string;

    // Alleen manager mag deze functie gebruiken
    const { data: roleRow } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "manager")
      .maybeSingle();
    if (!roleRow) return json({ error: "Forbidden" }, 403);

    // Rate limit (5 per 60s per user)
    const { data: allowed } = await supabase.rpc("check_rate_limit", {
      _key: userId,
      _endpoint: "bereken-afstand",
      _limit: 30,
      _window_seconds: 60,
    });
    if (allowed === false) return json({ error: "Rate limit exceeded" }, 429);

    let body: { origin?: unknown; destination?: unknown };
    try {
      body = await req.json();
    } catch {
      return json({ error: "Invalid JSON" }, 400);
    }

    const origin = typeof body.origin === "string" ? body.origin.trim() : "";
    const destination = typeof body.destination === "string" ? body.destination.trim() : "";
    if (origin.length < 3 || origin.length > 300) {
      return json({ error: "Origin ongeldig (3-300 tekens)" }, 400);
    }
    if (destination.length < 3 || destination.length > 300) {
      return json({ error: "Destination ongeldig (3-300 tekens)" }, 400);
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const GOOGLE_MAPS_API_KEY = Deno.env.get("GOOGLE_MAPS_API_KEY");
    if (!LOVABLE_API_KEY || !GOOGLE_MAPS_API_KEY) {
      return json({ error: "Google Maps connector niet geconfigureerd" }, 503);
    }

    const routesResp = await fetch(`${GATEWAY_URL}/routes/directions/v2:computeRoutes`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "X-Connection-Api-Key": GOOGLE_MAPS_API_KEY,
        "Content-Type": "application/json",
        "X-Goog-FieldMask": "routes.distanceMeters",
      },
      body: JSON.stringify({
        origin: { address: origin },
        destination: { address: destination },
        travelMode: "DRIVE",
        routingPreference: "TRAFFIC_UNAWARE",
      }),
    });

    if (!routesResp.ok) {
      const text = await routesResp.text();
      console.error("Routes API error", routesResp.status, text);
      return json({ error: "Afstandberekening mislukt", status: routesResp.status }, 502);
    }

    const data = await routesResp.json();
    const meters = data?.routes?.[0]?.distanceMeters;
    if (typeof meters !== "number" || meters <= 0) {
      return json({ error: "Geen route gevonden" }, 404);
    }

    const enkele_reis_km = Math.round(meters / 100) / 10;
    const retour_km = Math.round((meters * 2) / 100) / 10;

    return json({
      meters,
      enkele_reis_km,
      retour_km,
      bron: "google_routes",
    });
  } catch (err) {
    console.error("bereken-afstand error", err);
    return json({ error: "Interne fout" }, 500);
  }
});
