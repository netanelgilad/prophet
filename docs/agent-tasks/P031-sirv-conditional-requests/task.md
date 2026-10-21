# P031: sirv conditional requests complete; ETag/304 wire cases land

Implemented by Instinct in-sandbox; independent review pending.

## Goal

Reproduce sirv's conditional-request path end to end: with { etag: true }
the unchanged handler emits the weak validator from the declared file
stats, and an if-none-match request carrying that validator answers 304
with an empty body instead of the full response.

## Decision record

Host pin first (live server, unchanged sirv 3.0.2 / mrmime 2.0.1 /
totalist 3.0.1 / @polka/url 1.0.0-next.29 packages, Node 24.21.0,
2026-10-15): GET /hello.txt (16 bytes, mtime 1759500000000) through
sirv { etag: true } answers status 200 with ETag W/"16-1759500000000"
beside content-length, content-type and last-modified; a GET carrying
If-None-Match with that validator answers 304 with an empty body and no
application headers; a GET carrying a non-matching validator answers the
full 200 response with the same ETag again.

The capability proved latent from earlier increments: bounded Date
instances already carry getTime (P030's last-modified path carries
toUTCString), the template literal's number conversions already feed
send()'s Content-Range assembly, deliverRequest already declares
header-carrying dispatches (P030), and res.writeHead(304) with no
application headers plus res.end() already matches the is404 404 shape.
No source change was required; the increment lands the pinned wire
evidence as specs so the path cannot silently regress.

Specs: a second sirv-request test drives its own { etag: true } server
through three sequential deliveries on one listener - the plain GET
(status 200, body "hello from sirv\n", headers content-length,
content-type, etag W/"16-1759500000000" and last-modified), the matching
conditional GET (status 304, empty body, no response headers, no read
stream opened), and the stale-validator GET (the full 200 response with
the current validator). All assertions cite the host-pinned reference.

Docs migrations: sirv-target.md's milestone paragraph records the
conditional-request completion and narrows the remaining "other
header-carrying requests" gap accordingly.

Validation (sandbox, Node 24.21.0, PROPHET_NODE_BINARY pinned): full
suite and typecheck on the shipped tree (totals in the ledger);
sirv-request green individually.

## Follow-ups

- gzip/brotli negotiation needs accept-encoding handling plus compressed
  variant files and zlib content; separate work.
- Dev mode (viaLocal), single-page fallback, custom ignores (RegExp
  constructor) and custom setHeaders/onNoMatch callbacks stay unmodelled.
