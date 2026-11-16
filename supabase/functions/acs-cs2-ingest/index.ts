import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-acs-server-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

function reply(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isSteamId64(value: unknown): value is string {
  return typeof value === "string" && /^[0-9]{17}$/.test(value);
}

function validCount(value: unknown, max = 5000): value is number {
  return Number.isInteger(value) && Number(value) >= 0 && Number(value) <= max;
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return reply(405, { error: "method_not_allowed" });

  const expectedToken = Deno.env.get("ACS_CS2_INGEST_TOKEN");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!expectedToken || !supabaseUrl || !serviceKey) {
    console.error("ACS CS2 ingest secrets are not configured");
    return reply(503, { error: "integration_not_configured" });
  }

  const suppliedToken = req.headers.get("x-acs-server-token") ?? "";
  if (suppliedToken.length !== expectedToken.length ||
      !crypto.subtle.timingSafeEqual) {
    // Deno Web Crypto does not expose timingSafeEqual in all supported runtimes.
    if (suppliedToken !== expectedToken) return reply(401, { error: "unauthorized" });
  } else if (suppliedToken !== expectedToken) {
    return reply(401, { error: "unauthorized" });
  }

  const raw = await req.text();
  if (raw.length > 1_000_000) return reply(413, { error: "payload_too_large" });

  let body: any;
  try {
    body = JSON.parse(raw);
  } catch {
    return reply(400, { error: "invalid_json" });
  }

  if (body?.schema_version !== 1 || !isUuid(body?.match_id) ||
      typeof body?.server_id !== "string" || body.server_id.length < 2 ||
      body.server_id.length > 80 ||
      typeof body?.external_match_id !== "string" ||
      body.external_match_id.length < 1 || body.external_match_id.length > 120 ||
      !Array.isArray(body?.maps) || body.maps.length < 1 || body.maps.length > 5) {
    return reply(400, { error: "invalid_report_envelope" });
  }

  for (const map of body.maps) {
    if (typeof map?.map_name !== "string" || map.map_name.length > 80 ||
        !validCount(map?.map_number, 5) || map.map_number < 1 ||
        !validCount(map?.team_a_score, 100) || !validCount(map?.team_b_score, 100) ||
        !Array.isArray(map?.players) || map.players.length < 1 || map.players.length > 20) {
      return reply(400, { error: "invalid_map_report" });
    }
    for (const player of map.players) {
      if (!isSteamId64(player?.steam_id64) ||
          typeof player?.nickname !== "string" || player.nickname.length > 64 ||
          !["A", "B"].includes(player?.team_side) ||
          !validCount(player?.kills) || !validCount(player?.deaths) ||
          !validCount(player?.assists) || !validCount(player?.mvps, 100) ||
          !validCount(player?.damage, 100000) ||
          !validCount(player?.headshot_kills)) {
        return reply(400, { error: "invalid_player_stats" });
      }
    }
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: match, error: matchError } = await supabase
    .from("matches")
    .select("id,status")
    .eq("id", body.match_id)
    .maybeSingle();

  if (matchError) {
    console.error("Could not validate ACS match", matchError.message);
    return reply(500, { error: "match_lookup_failed" });
  }
  if (!match) return reply(404, { error: "acs_match_not_found" });

  const digest = await sha256(raw);
  const { data: previous, error: previousError } = await supabase
    .from("acs_cs2_match_reports")
    .select("id,payload_sha256,status")
    .eq("match_id", body.match_id)
    .maybeSingle();

  if (previousError) {
    console.error("Could not check duplicate report", previousError.message);
    return reply(500, { error: "duplicate_check_failed" });
  }
  if (previous) {
    if (previous.payload_sha256 === digest) {
      return reply(200, { ok: true, duplicate: true, report_id: previous.id, status: previous.status });
    }
    return reply(409, { error: "report_already_received", report_id: previous.id });
  }

  const { data: inserted, error: insertError } = await supabase
    .from("acs_cs2_match_reports")
    .insert({
      match_id: body.match_id,
      server_id: body.server_id,
      external_match_id: body.external_match_id,
      schema_version: 1,
      payload: body,
      payload_sha256: digest,
      status: "pending",
    })
    .select("id,status,received_at")
    .single();

  if (insertError) {
    console.error("Could not store ACS CS2 report", insertError.message);
    if (insertError.code === "23505") return reply(409, { error: "report_conflict" });
    return reply(500, { error: "report_store_failed" });
  }

  return reply(201, { ok: true, report_id: inserted.id, status: inserted.status, received_at: inserted.received_at });
});
