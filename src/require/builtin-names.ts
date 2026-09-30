// Node v24.21.0's public builtin names, pinned with the CommonJS oracle. Only
// identity/precedence is modeled here; this is not an implementation of them.
// Do not query the host Node: its version may expose a different set.
const unprefixed = new Set([
  "_http_agent", "_http_client", "_http_common", "_http_incoming", "_http_outgoing", "_http_server",
  "_stream_duplex", "_stream_passthrough", "_stream_readable", "_stream_transform", "_stream_wrap",
  "_stream_writable", "_tls_common", "_tls_wrap", "assert", "assert/strict", "async_hooks", "buffer",
  "child_process", "cluster", "console", "constants", "crypto", "dgram", "diagnostics_channel",
  "dns", "dns/promises", "domain", "events", "fs", "fs/promises", "http", "http2", "https",
  "inspector", "inspector/promises", "module", "net", "os", "path", "path/posix", "path/win32",
  "perf_hooks", "process", "punycode", "querystring", "readline", "readline/promises", "repl",
  "stream", "stream/consumers", "stream/promises", "stream/web", "string_decoder", "sys",
  "timers", "timers/promises", "tls", "trace_events", "tty", "url", "util", "util/types",
  "v8", "vm", "wasi", "worker_threads", "zlib"
]);
const prefixedOnly = new Set(["node:sea", "node:sqlite", "node:test", "node:test/reporters"]);

export function isBuiltinRequest(request: string): boolean {
  return unprefixed.has(request) || prefixedOnly.has(request) ||
    (request.startsWith("node:") && unprefixed.has(request.slice(5)));
}
