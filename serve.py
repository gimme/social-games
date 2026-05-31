#!/usr/bin/env python3
"""Dev server that disables caching so edits show up on every refresh."""
import sys
from http.server import HTTPServer, SimpleHTTPRequestHandler


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, max-age=0")
        super().end_headers()


port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
try:
    server = HTTPServer(("0.0.0.0", port), NoCacheHandler)
except OSError as e:
    sys.exit(
        f"\nCould not start on port {port}: {e.strerror}.\n"
        f"Another server is probably already using it (e.g. an old "
        f"`python3 -m http.server`).\n"
        f"Stop that one, or use a different port: make serve PORT={port + 1}\n"
    )
print(f"Serving on http://0.0.0.0:{port}  (no-cache) — Ctrl+C to stop")
try:
    server.serve_forever()
except KeyboardInterrupt:
    print("\nStopped.")
finally:
    server.server_close()
