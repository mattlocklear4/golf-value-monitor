// GitHub Pages migration: protected Visual Crossing proxy.
// Deploy only after configuring VISUAL_CROSSING_API_KEY in Supabase secrets.
// This endpoint requires an authenticated Supabase user AND an explicit allowlist.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const allowedOrigin = "https://mattlocklear4.github.io";
const cors = {
  "Access-Control-Allow-Origin": allowedOrigin,
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Vary": "Origin",
};
const reply = (message: unknown, status = 200) => new Response(JSON.stringify(message), {
  status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" }
});
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "GET") return reply({ error: "Method not allowed" }, 405);
  if (req.headers.get("origin") !== allowedOrigin) return reply({ error: "Origin not allowed" }, 403);
  const token = req.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1];
  if (!token) return reply({ error: "Sign in required" }, 401);
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const apiKey = Deno.env.get("VISUAL_CROSSING_API_KEY");
  const approvedIds = (Deno.env.get("GOLF_APPROVED_USER_IDS") || "").split(",").map(x => x.trim()).filter(Boolean);
  if (!supabaseUrl || !anonKey || !apiKey || !approvedIds.length) return reply({ error: "Function not configured" }, 503);
  const client = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: { user }, error } = await client.auth.getUser(token);
  if (error || !user || !approvedIds.includes(user.id)) return reply({ error: "Not authorized" }, 403);
  const u = new URL(req.url);
  const location = u.searchParams.get("location")?.trim() || "";
  const start = u.searchParams.get("start") || "";
  const end = u.searchParams.get("end") || "";
  if (!location || location.length > 180 || !/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end))
    return reply({ error: "Invalid location or dates" }, 400);
  const a = Date.parse(start + "T00:00:00Z"), b = Date.parse(end + "T00:00:00Z");
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a || b - a > 24 * 86400000)
    return reply({ error: "Date range must be 1–25 days" }, 400);
  const upstream = new URL("https://weather.visualcrossing.com/VisualCrossingWebServices/rest/services/timeline/" + encodeURIComponent(location) + "/" + start + "/" + end);
  upstream.searchParams.set("unitGroup", "us");
  upstream.searchParams.set("include", "hours");
  upstream.searchParams.set("contentType", "json");
  upstream.searchParams.set("key", apiKey);
  try {
    const result = await fetch(upstream, { signal: AbortSignal.timeout(25000) });
    if (!result.ok) return reply({ error: "Weather provider request failed", upstreamStatus: result.status }, 502);
    return reply(await result.json());
  } catch { return reply({ error: "Weather provider unavailable" }, 502); }
});
