#!/usr/bin/env python3
"""
Local proxy + static server for the INNODIGYM Power program editor.

Why a proxy: power.renhesports.com doesn't send CORS headers, so the browser
can't call it directly from a page served on localhost. This process forwards
anything under /api/* to the real API, unmodified, and serves the static
frontend for everything else. It stores no credentials itself — the token
lives only in the browser (localStorage) and is forwarded per-request via the
Authorization header the frontend sets.
"""
import http.server
import json
import urllib.error
import urllib.request

UPSTREAM = "https://power.renhesports.com"
PORT = 8787


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory="static", **kwargs)

    def log_message(self, fmt, *args):
        # Keep container logs readable; comment out to see every request.
        print("%s - %s" % (self.address_string(), fmt % args))

    def end_headers(self):
        # Static files are tiny and change on every deploy; without this the
        # browser heuristically caches an old app.js against a new index.html.
        if not self.path.startswith("/api/"):
            self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def do_GET(self):
        if self.path.startswith("/api/"):
            self.proxy("GET")
        elif self.path == "/favicon.ico":
            self.send_response(204)
            self.end_headers()
        else:
            super().do_GET()

    def do_POST(self):
        if self.path.startswith("/api/"):
            self.proxy("POST")
        else:
            self.send_error(404)

    def do_PUT(self):
        if self.path.startswith("/api/"):
            self.proxy("PUT")
        else:
            self.send_error(404)

    def do_DELETE(self):
        if self.path.startswith("/api/"):
            self.proxy("DELETE")
        else:
            self.send_error(404)

    def proxy(self, method):
        url = UPSTREAM + self.path
        length = int(self.headers.get("Content-Length", 0) or 0)
        body = self.rfile.read(length) if length else None

        req = urllib.request.Request(url, data=body, method=method)
        auth = self.headers.get("Authorization")
        if auth:
            req.add_header("Authorization", auth)
        ctype = self.headers.get("Content-Type")
        req.add_header("Content-Type", ctype or "application/json")

        try:
            with urllib.request.urlopen(req, timeout=20) as resp:
                self._relay(resp.status, resp.read(), resp.headers.get("Content-Type"))
        except urllib.error.HTTPError as e:
            self._relay(e.code, e.read(), e.headers.get("Content-Type") if e.headers else None)
        except Exception as e:  # noqa: BLE001 - surface any proxy failure to the UI
            payload = json.dumps({"error": True, "proxyError": str(e)}).encode()
            self._relay(502, payload, "application/json")

    def _relay(self, status, data, content_type):
        self.send_response(status)
        self.send_header("Content-Type", content_type or "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


if __name__ == "__main__":
    server = http.server.ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    print(f"Serving on http://0.0.0.0:{PORT}  (proxying /api/* to {UPSTREAM})")
    server.serve_forever()
