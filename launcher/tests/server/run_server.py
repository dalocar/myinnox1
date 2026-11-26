"""Run the real server.py entry point for the tests, with two substitutions made
here rather than in server.py: it listens on an ephemeral loopback port (8787
may be in use), and calls to the upstream API are recorded and refused."""
import http.server
import os
import runpy
import sys
import urllib.request

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
RealServer = http.server.ThreadingHTTPServer


class EphemeralServer(RealServer):
    def __init__(self, address, handler):
        if address != ("0.0.0.0", 8787):
            raise SystemExit("unexpected listen address %r" % (address,))
        super().__init__(("127.0.0.1", 0), handler)
        sys.stderr.write("PORT %d\n" % self.server_address[1])
        sys.stderr.flush()


def refuse_upstream(request, *args, **kwargs):
    sys.stderr.write("UPSTREAM %s %s\n" % (request.get_method(), request.full_url))
    sys.stderr.flush()
    raise OSError("upstream blocked in tests")


http.server.ThreadingHTTPServer = EphemeralServer
urllib.request.urlopen = refuse_upstream
runpy.run_path(os.path.join(REPO, "server.py"), run_name="__main__")
