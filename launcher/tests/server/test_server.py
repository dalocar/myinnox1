"""Tests for server.py, with and without launcher mode.

    python3 -m unittest discover -s launcher/tests/server -v

Each server is a real subprocess on an ephemeral port (see run_server.py). The
allowed Host values are fixed at port 8787, so requests send Host explicitly.
Nothing here connects to port 8787 or to the upstream API.
"""
import email.utils
import http.client
import json
import os
import re
import signal
import socket
import subprocess
import sys
import tempfile
import time
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
HOSTS = ("localhost:8787", "127.0.0.1:8787")
ORIGINS = ("http://localhost:8787", "http://127.0.0.1:8787")
TAG = b'<script src="/_local/ui.js"></script>'
LOCAL_GETS = ("/_local/status", "/_local/ui.js")


def read(*parts):
    with open(os.path.join(REPO, *parts), "rb") as f:
        return f.read()


class Server:
    def __init__(self, launcher="1"):
        env = dict(os.environ)
        env.pop("MYINNOX1_LAUNCHER", None)
        if launcher is not None:
            env["MYINNOX1_LAUNCHER"] = launcher
        self.out = tempfile.TemporaryFile()
        self.err = tempfile.NamedTemporaryFile()
        self.proc = subprocess.Popen(
            [sys.executable, "-B", "-u", os.path.join(HERE, "run_server.py")],
            cwd=REPO, env=env, stdout=self.out, stderr=self.err,
        )
        deadline = time.time() + 15
        while True:
            match = re.search(r"^PORT (\d+)$", self.errors(), re.M)
            if match:
                self.port = int(match.group(1))
                return
            if self.proc.poll() is not None or time.time() > deadline:
                message = self.errors()
                self.close()
                raise RuntimeError("server did not start: " + message)
            time.sleep(0.02)

    def errors(self):
        with open(self.err.name, "rb") as f:
            return f.read().decode("utf-8", "replace")

    def request(self, method, path, headers=(), host=HOSTS[0], body=None):
        """headers is a list of pairs so a header can be repeated; host=None omits Host."""
        conn = http.client.HTTPConnection("127.0.0.1", self.port, timeout=10)
        try:
            conn.putrequest(method, path, skip_host=True, skip_accept_encoding=True)
            if host is not None:
                conn.putheader("Host", host)
            for name, value in headers:
                conn.putheader(name, value)
            if body is not None and not any(n.lower() == "content-length" for n, _ in headers):
                conn.putheader("Content-Length", str(len(body)))
            conn.endheaders(body)
            res = conn.getresponse()
            return res.status, res.headers, res.read()
        finally:
            conn.close()

    def stop(self, path="/_local/stop", headers=(), **kwargs):
        return self.request("POST", path, [("X-MyInnoX1", "stop")] + list(headers), **kwargs)

    def close(self):
        if self.proc.poll() is None:
            self.proc.kill()
        self.proc.wait(timeout=10)
        self.out.close()
        self.err.close()


class SharedServer(unittest.TestCase):
    launcher = "1"

    @classmethod
    def setUpClass(cls):
        cls.server = Server(cls.launcher)

    @classmethod
    def tearDownClass(cls):
        cls.server.close()

    def assertAlive(self):
        # Longer than the delay between a stop reply and the shutdown.
        time.sleep(1.0)
        self.assertIsNone(self.server.proc.poll(), "server exited")

    def assertNoCors(self, headers):
        self.assertEqual([k for k in headers.keys() if k.lower().startswith("access-control-")], [])


class NotLauncherMode(SharedServer):
    launcher = None

    def test_index_is_unmodified_and_cacheable_as_before(self):
        for path in ("/", "/index.html", "/?x=1"):
            status, headers, body = self.server.request("GET", path)
            self.assertEqual(status, 200)
            self.assertEqual(body, read("static", "index.html"))
            self.assertNotIn(b"/_local/", body)
            self.assertEqual(headers["Cache-Control"], "no-cache")
            again = self.server.request(
                "GET", path, [("If-Modified-Since", headers["Last-Modified"])])
            self.assertEqual(again[0], 304)

    def test_head_index_is_unmodified(self):
        status, headers, body = self.server.request("HEAD", "/index.html")
        self.assertEqual((status, body), (200, b""))
        self.assertEqual(int(headers["Content-Length"]), len(read("static", "index.html")))
        self.assertIn("Last-Modified", headers)

    def test_local_routes_do_not_exist(self):
        for host in HOSTS:
            for method in ("GET", "HEAD"):
                for path in LOCAL_GETS + ("/_local/stop", "/_local/"):
                    status = self.server.request(method, path, host=host)[0]
                    self.assertEqual(status, 404, (method, path))
        for origin in (None,) + ORIGINS:
            headers = [("Origin", origin)] if origin else []
            self.assertEqual(self.server.stop(headers=headers)[0], 404)
        self.assertAlive()
        self.assertNotIn("UPSTREAM", self.server.errors())

    def test_favicon_and_ping_keep_working(self):
        self.assertEqual(self.server.request("GET", "/favicon.ico")[0], 204)
        self.assertEqual(self.server.request("POST", "/api/ping", body=b"{}")[0], 204)


class OtherEnvironmentValues(unittest.TestCase):
    def test_only_the_value_1_enables_launcher_mode(self):
        for value in ("", "0", "true", "yes", "11"):
            server = Server(value)
            try:
                self.assertEqual(server.request("GET", "/_local/status")[0], 404, value)
                self.assertNotIn(TAG, server.request("GET", "/")[2], value)
                self.assertEqual(server.stop()[0], 404, value)
            finally:
                server.close()


class LauncherPages(SharedServer):
    def expected_index(self):
        original = read("static", "index.html")
        at = original.rfind(b"</body>")
        self.assertGreater(at, 0)
        return original[:at] + TAG + original[at:]

    def test_script_tag_is_added_once_before_the_closing_body_tag(self):
        for path in ("/", "/index.html", "/?lang=de", "/index.html?v=2#top"):
            status, headers, body = self.server.request("GET", path)
            self.assertEqual(status, 200, path)
            self.assertEqual(body, self.expected_index(), path)
            self.assertEqual(body.count(TAG), 1)
            self.assertEqual(int(headers["Content-Length"]), len(body))
            self.assertTrue(headers["Content-Type"].startswith("text/html"))
            self.assertEqual(headers.get_all("Cache-Control"), ["no-cache"])
            self.assertNoCors(headers)

    def test_file_on_disk_is_not_changed(self):
        self.server.request("GET", "/")
        self.assertNotIn(b"/_local/", read("static", "index.html"))

    def test_conditional_get_still_returns_the_injected_page(self):
        later = email.utils.formatdate(time.time() + 86400, usegmt=True)
        for path in ("/", "/index.html"):
            status, headers, body = self.server.request("GET", path, [("If-Modified-Since", later)])
            self.assertEqual((status, body), (200, self.expected_index()))
            self.assertNotIn("Last-Modified", headers)

    def test_head_matches_get(self):
        for path in ("/", "/index.html"):
            status, headers, body = self.server.request("HEAD", path)
            self.assertEqual((status, body), (200, b""))
            self.assertEqual(int(headers["Content-Length"]), len(self.expected_index()))

    def test_page_is_served_for_any_host(self):
        # The Host rule protects /_local/* only.
        self.assertEqual(self.server.request("GET", "/", host="192.168.1.5:8787")[0], 200)

    def test_other_static_files_are_unchanged(self):
        status, headers, body = self.server.request("GET", "/app.js")
        self.assertEqual((status, body), (200, read("static", "app.js")))
        again = self.server.request(
            "GET", "/app.js", [("If-Modified-Since", headers["Last-Modified"])])
        self.assertEqual(again[0], 304)


class LauncherRoutes(SharedServer):
    def test_status(self):
        for host in HOSTS:
            for path in ("/_local/status", "/_local/status?t=1"):
                status, headers, body = self.server.request("GET", path, host=host)
                self.assertEqual(status, 200)
                self.assertEqual(json.loads(body), {"app": "myinnox1", "launcher": True})
                self.assertEqual(headers["Content-Type"], "application/json")
                self.assertNoCors(headers)

    def test_ui_script(self):
        for host in HOSTS:
            status, headers, body = self.server.request("GET", "/_local/ui.js?v=1", host=host)
            self.assertEqual((status, body), (200, read("launcher", "ui", "local-stop.js")))
            self.assertIn("javascript", headers["Content-Type"])
            self.assertEqual(headers.get_all("Cache-Control"), ["no-cache"])
            self.assertNoCors(headers)

    def test_head(self):
        status, headers, body = self.server.request("HEAD", "/_local/ui.js")
        self.assertEqual((status, body), (200, b""))
        self.assertEqual(int(headers["Content-Length"]), len(read("launcher", "ui", "local-stop.js")))
        self.assertEqual(self.server.request("HEAD", "/_local/status", host="evil.test")[0], 403)

    def test_wrong_host_is_rejected(self):
        bad = (None, "", "localhost", "127.0.0.1", "localhost:80", "localhost:8788",
               "LOCALHOST:8787", "localhost.:8787", "0.0.0.0:8787", "[::1]:8787",
               "evil.test:8787", "localhost:8787.evil.test", "evil.test@localhost:8787",
               "127.0.0.1:%d" % self.server.port)
        for host in bad:
            for path in LOCAL_GETS:
                status, headers, body = self.server.request("GET", path, host=host)
                self.assertEqual(status, 403, (host, path))
                self.assertNotIn(b'"launcher"', body)
                self.assertNoCors(headers)
            self.assertEqual(self.server.stop(host=host)[0], 403, host)
        self.assertAlive()

    def test_repeated_host_is_rejected(self):
        for extra in ("evil.test", HOSTS[0]):
            self.assertEqual(
                self.server.request("GET", "/_local/status", [("Host", extra)])[0], 403)
            self.assertEqual(self.server.stop(headers=[("Host", extra)])[0], 403)
        self.assertAlive()

    def test_stop_needs_the_exact_custom_header(self):
        cases = ([], [("X-MyInnoX1", "")], [("X-MyInnoX1", "Stop")], [("X-MyInnoX1", "stop2")],
                 [("X-MyInnoX1", "stop, stop")], [("X-MyInnoX", "stop")],
                 [("X-MyInnoX1", "stop"), ("X-MyInnoX1", "go")])
        for headers in cases:
            self.assertEqual(
                self.server.request("POST", "/_local/stop", headers)[0], 403, headers)
        self.assertAlive()

    def test_foreign_origin_is_rejected(self):
        bad = ("", "null", "http://evil.test", "https://localhost:8787", "http://localhost",
               "http://localhost:3000", "http://localhost:8787/", "http://LOCALHOST:8787",
               "http://localhost:8787.evil.test", "http://localhost:8787 http://evil.test")
        for origin in bad:
            status, headers, _ = self.server.stop(headers=[("Origin", origin)])
            self.assertEqual(status, 403, origin)
            self.assertNoCors(headers)
        both = [("Origin", ORIGINS[0]), ("Origin", "http://evil.test")]
        self.assertEqual(self.server.stop(headers=both)[0], 403)
        self.assertAlive()

    def test_rejections_with_a_request_body(self):
        for body in (b"x", b"x" * 20000):
            self.assertEqual(self.server.request("POST", "/_local/stop", body=body)[0], 403)
            self.assertEqual(self.server.request("POST", "/_local/nope", body=body)[0], 404)
        for length in ("abc", "-1", ""):
            headers = [("Content-Length", length)]
            self.assertEqual(
                self.server.request("POST", "/_local/stop", headers)[0], 403, length)
        self.assertAlive()

    def test_cross_site_preflight_is_never_approved(self):
        status, headers, _ = self.server.request("OPTIONS", "/_local/stop", [
            ("Origin", "http://evil.test"),
            ("Access-Control-Request-Method", "POST"),
            ("Access-Control-Request-Headers", "x-myinnox1"),
        ])
        self.assertEqual(status, 501)
        self.assertNoCors(headers)
        self.assertAlive()

    def test_unknown_paths_and_methods(self):
        for path in ("/_local", "/_local/", "/_local/nope", "/_local/status/", "/_local/stop/x",
                     "/_local/Status", "/_local/../server.py", "/_local/ui.js/..",
                     "/_local/%73tatus", "/%5Flocal/status", "/_local/stop"):
            status, _, body = self.server.request("GET", path)
            self.assertEqual(status, 404, path)
            self.assertNotIn(b"UPSTREAM", body)
        for path in ("/_local", "/_local/", "/_local/status", "/_local/ui.js", "/_local/stop/",
                     "/_local/%73top", "/%5Flocal/stop"):
            self.assertEqual(self.server.stop(path)[0], 404, path)
        for method in ("PUT", "DELETE"):
            headers = [("X-MyInnoX1", "stop")]
            self.assertEqual(self.server.request(method, "/_local/stop", headers)[0], 404)
        self.assertEqual(self.server.request("PATCH", "/_local/stop")[0], 501)
        self.assertAlive()

    def test_sources_outside_static_are_not_served(self):
        for path in ("/server.py", "/launcher/ui/local-stop.js", "/../server.py",
                     "/%2e%2e/server.py"):
            self.assertEqual(self.server.request("GET", path)[0], 404, path)


class NeverProxied(unittest.TestCase):
    def test_local_paths_stay_local(self):
        server = Server()
        try:
            for method in ("GET", "HEAD", "POST", "PUT", "DELETE"):
                for path in ("/_local/status", "/_local/ui.js", "/_local/nope",
                             "/_local/x?next=/api/y"):
                    server.request(method, path)
            server.request("POST", "/_local/stop", host="evil.test")
            self.assertNotIn("UPSTREAM", server.errors())
            # Control: the recorder does see a proxied request.
            status, _, body = server.request("GET", "/api/probe")
            self.assertEqual(status, 502)
            self.assertIn(b"upstream blocked in tests", body)
            self.assertEqual(server.errors().count("UPSTREAM"), 1)
        finally:
            server.close()


class ValidStop(unittest.TestCase):
    def setUp(self):
        self.server = Server()
        self.addCleanup(self.server.close)

    def assertStopped(self, response):
        status, headers, body = response
        self.assertEqual(status, 202)
        self.assertEqual(json.loads(body), {"stopping": True})
        self.assertEqual(int(headers["Content-Length"]), len(body))
        self.assertEqual([k for k in headers.keys() if k.lower().startswith("access-control-")], [])
        self.assertEqual(self.server.proc.wait(timeout=10), 42)
        self.assertNotIn("Traceback", self.server.errors())
        self.assertNotIn("UPSTREAM", self.server.errors())

    def test_without_origin(self):
        self.assertStopped(self.server.stop())

    def test_localhost_origin(self):
        self.assertStopped(self.server.stop(headers=[("Origin", ORIGINS[0])]))

    def test_loopback_address(self):
        self.assertStopped(self.server.stop(host=HOSTS[1], headers=[("Origin", ORIGINS[1])]))

    def test_with_query_string_and_body(self):
        self.assertStopped(self.server.stop("/_local/stop?from=ui", body=b"x" * 20000))

    def test_with_empty_body_as_browsers_send_it(self):
        self.assertStopped(self.server.stop(headers=[("Content-Length", "0")]))

    def test_with_invalid_content_length(self):
        self.assertStopped(self.server.stop(headers=[("Content-Length", "abc")]))

    def test_with_a_body_that_never_arrives(self):
        self.assertStopped(self.server.stop(headers=[("Content-Length", "10")]))

    def test_while_other_connections_are_open(self):
        idle = socket.create_connection(("127.0.0.1", self.server.port), timeout=10)
        partial = socket.create_connection(("127.0.0.1", self.server.port), timeout=10)
        self.addCleanup(idle.close)
        self.addCleanup(partial.close)
        partial.sendall(b"GET / HTTP/1.1\r\n")
        self.assertStopped(self.server.stop())

    def test_even_if_the_client_does_not_read_the_reply(self):
        with socket.create_connection(("127.0.0.1", self.server.port), timeout=10) as sock:
            sock.sendall(b"POST /_local/stop HTTP/1.1\r\nHost: localhost:8787\r\n"
                         b"X-MyInnoX1: stop\r\n\r\n")
        self.assertEqual(self.server.proc.wait(timeout=10), 42)


class OtherExits(unittest.TestCase):
    @unittest.skipIf(os.name == "nt", "POSIX signals")
    def test_being_terminated_does_not_exit_with_42(self):
        server = Server()
        self.addCleanup(server.close)
        self.assertEqual(server.request("GET", "/_local/status")[0], 200)
        server.proc.send_signal(signal.SIGTERM)
        self.assertNotIn(server.proc.wait(timeout=10), (0, 42))


class Packaging(unittest.TestCase):
    def test_dockerfile_copies_the_button(self):
        self.assertIn(b"\nCOPY launcher/ui ./launcher/ui\n", read("Dockerfile"))

    def test_button_has_every_string_in_every_language(self):
        source = read("launcher", "ui", "local-stop.js").decode("utf-8")
        blocks = dict(re.findall(r"^    (\w\w): \{\n(.*?)^    \},", source, re.M | re.S))
        self.assertEqual(sorted(blocks), sorted("en es de fr it ko zh ja".split()))
        for lang, block in blocks.items():
            self.assertEqual(re.findall(r"^      (\w+): \"", block, re.M),
                             ["button", "confirm", "stopped", "detail", "failed"], lang)

    def test_button_makes_no_external_requests(self):
        source = read("launcher", "ui", "local-stop.js").decode("utf-8")
        self.assertNotRegex(source, r"https?://")
        self.assertEqual(re.findall(r"fetch\(\"([^\"]*)\"", source), ["/_local/stop"])


if __name__ == "__main__":
    unittest.main()
