#!/usr/bin/env python3
"""Chopsticks static server: serves web/ on port 4242 (env PORT), plus /api/health and /snapshot."""
import http.server, json, os, socketserver
ROOT = os.path.dirname(os.path.abspath(__file__))
PORT = int(os.environ.get("PORT", "4242"))

class H(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k): super().__init__(*a, directory=os.path.join(ROOT, "web"), **k)
    def log_message(self, *a): pass
    def end_headers(self):
        self.send_header("Cache-Control", "no-cache"); super().end_headers()
    def do_GET(self):
        if self.path.startswith("/api/health"):
            b = json.dumps({"ok": True, "app": "chopsticks", "port": PORT}).encode()
            self.send_response(200); self.send_header("Content-Type", "application/json"); self.send_header("Content-Length", str(len(b))); self.end_headers(); self.wfile.write(b); return
        if self.path.split("?")[0] in ("/snapshot", "/snapshot.html"):
            p = os.path.join(ROOT, "dist", "chopsticks-snapshot.html"); b = open(p, "rb").read()
            self.send_response(200); self.send_header("Content-Type", "text/html; charset=utf-8"); self.send_header("Content-Length", str(len(b))); self.end_headers(); self.wfile.write(b); return
        return super().do_GET()

class S(socketserver.ThreadingMixIn, http.server.HTTPServer): daemon_threads = True; allow_reuse_address = True
if __name__ == "__main__":
    print(f"Chopsticks on http://127.0.0.1:{PORT}"); S(("0.0.0.0", PORT), H).serve_forever()
