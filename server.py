#!/usr/bin/env python3
"""
Local proxy + static server for the INNODIGYM Power program editor.

Why a proxy: power.renhesports.com doesn't send CORS headers, so the browser
can't call it directly from a page served on localhost. This process forwards
anything under /api/* to the real API, unmodified, and serves the static
frontend for everything else. It stores no credentials itself — the token
lives only in the browser (localStorage) and is forwarded per-request via the
Authorization header the frontend sets.

With MYINNOX1_LAUNCHER=1 (set only by the desktop launcher) it also serves the
/_local/* routes, adds the Stop button script to index.html, and exits with
status 42 on a valid stop request so the launcher can clean up on the host.
"""
import http.server
import json
import os
import sys
import threading
import time
import urllib.error
import urllib.request

UPSTREAM = "https://power.renhesports.com"
PORT = 8787

LAUNCHER_MODE = os.environ.get("MYINNOX1_LAUNCHER") == "1"
STOP_EXIT_CODE = 42  # the launcher's watcher acts on this status only
# Fixed on purpose (DNS rebinding and cross-site protection); not configurable.
LOCAL_HOSTS = ("localhost:8787", "127.0.0.1:8787")
LOCAL_ORIGINS = tuple("http://" + host for host in LOCAL_HOSTS)
LOCAL_UI_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "launcher", "ui", "local-stop.js")
LOCAL_UI_TAG = b'<script src="/_local/ui.js"></script>'


def shutdown_soon(server):
    # A short pause lets the handler close its connection (and the reply get out
    # of the container) before the process exits.
    time.sleep(0.25)
    server.shutdown()


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
        elif LAUNCHER_MODE and self.launcher_get():
            pass
        elif self.path == "/favicon.ico":
            self.send_response(204)
            self.end_headers()
        else:
            super().do_GET()

    def do_HEAD(self):
        if not (LAUNCHER_MODE and self.launcher_get()):
            super().do_HEAD()

    def do_POST(self):
        if LAUNCHER_MODE and self.route().startswith("/_local/"):
            self.launcher_post()
        elif self.path.startswith("/api/ping"):
            # Support-nudge counters: only collected on the deployed site.
            self.send_response(204)
            self.end_headers()
        elif self.path.startswith("/api/"):
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

    # ---------- desktop launcher (only reached when LAUNCHER_MODE) ----------

    def route(self):
        return self.path.split("?", 1)[0].split("#", 1)[0]

    def launcher_get(self):
        """Handle a GET or HEAD that differs in launcher mode; False if it does not."""
        route = self.route()
        if route in ("/", "/index.html"):
            self.send_index()
        elif not route.startswith("/_local/"):
            return False
        elif route not in ("/_local/status", "/_local/ui.js"):
            self.send_error(404)
        elif not self.local_host_ok():
            self.send_error(403)
        elif route == "/_local/status":
            self.send_json(200, {"app": "myinnox1", "launcher": True})
        else:
            self.send_file(LOCAL_UI_FILE, "text/javascript; charset=utf-8")
        return True

    def launcher_post(self):
        # Read any body first: closing with unread data can reset the connection
        # before the client has seen the reply.
        self.discard_body()
        if self.route() != "/_local/stop":
            self.send_error(404)
            return
        origins = self.headers.get_all("Origin", [])
        if not (
            self.local_host_ok()
            and self.headers.get_all("X-MyInnoX1", []) == ["stop"]
            and (not origins or (len(origins) == 1 and origins[0] in LOCAL_ORIGINS))
        ):
            self.send_error(403)
            return
        self.server.stop_requested = True
        try:
            self.send_json(202, {"stopping": True})
        finally:
            # Only after the reply is written; shutdown() blocks until
            # serve_forever() returns, so it gets its own thread.
            threading.Thread(target=shutdown_soon, args=(self.server,), daemon=True).start()

    def local_host_ok(self):
        hosts = self.headers.get_all("Host", [])
        return len(hosts) == 1 and hosts[0] in LOCAL_HOSTS

    def discard_body(self):
        try:
            length = int(self.headers.get("Content-Length", 0) or 0)
        except ValueError:
            return
        if length <= 0:
            return
        self.connection.settimeout(2)
        try:
            self.rfile.read(min(length, 65536))
        except OSError:
            pass
        finally:
            self.connection.settimeout(self.timeout)

    def send_index(self):
        # Built here rather than by the static handler: no Last-Modified and no
        # 304, so a copy cached without the script tag is never revalidated.
        path = self.translate_path("/index.html")
        self.send_file(path, "text/html", insert=LOCAL_UI_TAG)

    def send_file(self, path, content_type, insert=None):
        try:
            with open(path, "rb") as f:
                data = f.read()
        except OSError:
            self.send_error(404)
            return
        if insert:
            at = data.rfind(b"</body>")
            if at >= 0:
                data = data[:at] + insert + data[at:]
        self.send_bytes(200, data, content_type)

    def send_json(self, status, payload):
        self.send_bytes(status, json.dumps(payload).encode(), "application/json")

    def send_bytes(self, status, data, content_type):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(data)

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
    # Only a valid /_local/stop shuts the server down.
    if getattr(server, "stop_requested", False):
        try:
            server.server_close()
            print("Stop requested from the dashboard, exiting.")
            sys.stdout.flush()
        finally:
            # Skips interpreter teardown, which can crash (and change the exit
            # status) while a daemon handler thread is still printing.
            os._exit(STOP_EXIT_CODE)
