"""Fake S3 for the CI boot check: an empty bucket that accepts everything.

The runtime image restores its database from MinIO at boot (litestream restore, then
litestream replicate). The boot check only needs that step to see "no replica yet" and
to keep running, so no real MinIO (and no real credential) is involved.
"""

import http.server

BODY = (
    b'<?xml version="1.0" encoding="UTF-8"?>'
    b"<ListBucketResult><Name>ci</Name><IsTruncated>false</IsTruncated></ListBucketResult>"
)


class Handler(http.server.BaseHTTPRequestHandler):
    def _send(self, body: bytes) -> None:
        self.send_response(200)
        self.send_header("Content-Type", "application/xml")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:
        self._send(BODY)

    def do_HEAD(self) -> None:
        self.send_response(200)
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_PUT(self) -> None:
        self.send_response(200)
        self.send_header("Content-Length", "0")
        self.end_headers()

    do_DELETE = do_PUT
    do_POST = do_PUT

    def log_message(self, *args) -> None:
        pass


http.server.HTTPServer(("", 9000), Handler).serve_forever()
