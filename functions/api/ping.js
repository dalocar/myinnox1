// Cloudflare Pages Function: anonymous support-nudge counters.
// Records ONLY an event name, a placement label and the two-letter country code
// Cloudflare derives from the connection, in Workers Analytics Engine (binding
// SUPPORT_EVENTS). No user id, email, token, IP address or user agent is read or
// stored. More specific than [[path]].js, so it is never proxied upstream.
// Without the binding (local dev, or not configured yet) it simply does nothing.

const EVENTS = new Set(["banner_shown", "banner_later", "coffee_click"]);
const PLACES = new Set(["banner", "footer", "history", "fitness", "profile", "login", ""]);

export async function onRequestPost({ request, env }) {
  const url = new URL(request.url);
  const event = url.searchParams.get("e") || "";
  const where = url.searchParams.get("w") || "";
  // Country only (e.g. "ES"); anything that is not exactly two letters is stored as "".
  const raw = (request.cf && request.cf.country) || request.headers.get("CF-IPCountry") || "";
  const country = /^[A-Z]{2}$/.test(raw) ? raw : "";
  if (EVENTS.has(event) && PLACES.has(where) && env.SUPPORT_EVENTS) {
    env.SUPPORT_EVENTS.writeDataPoint({ blobs: [event, where, country], doubles: [1], indexes: [event] });
  }
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
