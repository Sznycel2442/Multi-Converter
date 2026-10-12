#!/usr/bin/env python3
"""
Multi-Converter

    python serve.py            http://localhost:8000
"""
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8000

EXTRA_MIME = {
    ".js": "text/javascript",
    ".mjs": "text/javascript",
    ".wasm": "application/wasm",
    ".json": "application/json",
    ".css": "text/css",
    ".svg": "image/svg+xml",
}


class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cross-Origin-Opener-Policy", "same-origin")
        self.send_header("Cross-Origin-Embedder-Policy", "credentialless")
        self.send_header("Cross-Origin-Resource-Policy", "cross-origin")
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def guess_type(self, path):
        for ext, mime in EXTRA_MIME.items():
            if path.endswith(ext):
                return mime
        return super().guess_type(path)

    def log_message(self, fmt, *args):
        sys.stdout.write("  %s\n" % (fmt % args))


class Server(ThreadingHTTPServer):
    allow_reuse_address = False


def main():
    try:
        server = Server(("127.0.0.1", PORT), Handler)
    except OSError as e:
        print("  BŁĄD: nie mogę zająć portu %d (%s)." % (PORT, e))
        print("  Zajęty przez inną instancję? Użyj: python serve.py <inny_port>")
        sys.exit(1)
    print("=" * 56)
    print("  MULTI//CONVERTER — serwer deweloperski")
    print("  ->  http://localhost:%d" % PORT)
    print("  (Ctrl+C aby zatrzymać)")
    print("=" * 56)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n  Zatrzymano.")
        server.server_close()


if __name__ == "__main__":
    main()
