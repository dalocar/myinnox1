// Cloudflare Pages Function: replaces server.py's /api/* proxy.
// Forwards to the upstream API unmodified. Stores nothing and never logs
// the Authorization header.
//
// Rate limiting is NOT done here (a Function's memory isn't shared across
// Cloudflare instances, so a counter in code can't enforce anything). It is a
// WAF rate-limiting rule on the zone instead, which only applies to requests on
// the custom domain, so the API is served on that hostname only.

const UPSTREAM = "https://power.renhesports.com";
const ALLOWED_METHODS = new Set(["GET", "POST", "PUT", "DELETE"]);
const ALLOWED_HOSTS = new Set(["myinnox1.carralabs.app", "localhost", "127.0.0.1"]);
const PUBLIC_URL = "https://myinnox1.carralabs.app";
const TIMEOUT_MS = 20000;

function json(status, obj) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

export async function onRequest({ request }) {
  if (!ALLOWED_METHODS.has(request.method)) {
    return json(405, { error: true, proxyError: "method not allowed" });
  }

  const incoming = new URL(request.url);
  if (!ALLOWED_HOSTS.has(incoming.hostname)) {
    return json(403, { error: true, proxyError: "use " + PUBLIC_URL });
  }
  // Only /api/* is reachable; this function is mounted there, but be explicit
  // so the proxy can never be pointed at another host or path.
  if (!incoming.pathname.startsWith("/api/") || incoming.pathname.includes("..")) {
    return json(400, { error: true, proxyError: "bad path" });
  }

  const headers = new Headers();
  const auth = request.headers.get("Authorization");
  if (auth) headers.set("Authorization", auth);
  headers.set("Content-Type", request.headers.get("Content-Type") || "application/json");

  const hasBody = request.method !== "GET";
  try {
    const resp = await fetch(UPSTREAM + incoming.pathname + incoming.search, {
      method: request.method,
      headers,
      body: hasBody ? await request.arrayBuffer() : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const out = new Headers();
    out.set("Content-Type", resp.headers.get("Content-Type") || "application/json");
    out.set("Cache-Control", "no-store");
    return new Response(resp.body, { status: resp.status, headers: out });
  } catch (e) {
    return json(502, { error: true, proxyError: String(e) });
  }
}
