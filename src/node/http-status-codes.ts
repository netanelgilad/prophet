import { ESObject, TESObject } from "../Object";
import { ESString, TESString } from "../string/String";

// Node v24.21.0, commit 955266bfdd854cd280dffd47548673914484e4c0.
// Complete STATUS_CODES data from lib/_http_server.js:
// https://github.com/nodejs/node/blob/955266bfdd854cd280dffd47548673914484e4c0/lib/_http_server.js
// This snapshot is data, not a call into native Node during VM execution.
const phrases: { readonly [code: string]: string } = Object.freeze({
  100: "Continue",
  101: "Switching Protocols",
  102: "Processing",
  103: "Early Hints",
  200: "OK",
  201: "Created",
  202: "Accepted",
  203: "Non-Authoritative Information",
  204: "No Content",
  205: "Reset Content",
  206: "Partial Content",
  207: "Multi-Status",
  208: "Already Reported",
  226: "IM Used",
  300: "Multiple Choices",
  301: "Moved Permanently",
  302: "Found",
  303: "See Other",
  304: "Not Modified",
  305: "Use Proxy",
  307: "Temporary Redirect",
  308: "Permanent Redirect",
  400: "Bad Request",
  401: "Unauthorized",
  402: "Payment Required",
  403: "Forbidden",
  404: "Not Found",
  405: "Method Not Allowed",
  406: "Not Acceptable",
  407: "Proxy Authentication Required",
  408: "Request Timeout",
  409: "Conflict",
  410: "Gone",
  411: "Length Required",
  412: "Precondition Failed",
  413: "Payload Too Large",
  414: "URI Too Long",
  415: "Unsupported Media Type",
  416: "Range Not Satisfiable",
  417: "Expectation Failed",
  418: "I'm a Teapot",
  421: "Misdirected Request",
  422: "Unprocessable Entity",
  423: "Locked",
  424: "Failed Dependency",
  425: "Too Early",
  426: "Upgrade Required",
  428: "Precondition Required",
  429: "Too Many Requests",
  431: "Request Header Fields Too Large",
  451: "Unavailable For Legal Reasons",
  500: "Internal Server Error",
  501: "Not Implemented",
  502: "Bad Gateway",
  503: "Service Unavailable",
  504: "Gateway Timeout",
  505: "HTTP Version Not Supported",
  506: "Variant Also Negotiates",
  507: "Insufficient Storage",
  508: "Loop Detected",
  509: "Bandwidth Limit Exceeded",
  510: "Not Extended",
  511: "Network Authentication Required"
});

// Each host environment receives an ordinary mutable data object. Expose this
// identity on http.STATUS_CODES and retain it internally: replacing the module
// export does not replace the catalog closed over by Node's response methods.
export function createHTTPStatusCodes(): TESObject {
  const properties: { [code: string]: TESString } = {};
  for (const code of Object.keys(phrases)) properties[code] = ESString(phrases[code]);
  return ESObject(properties);
}
