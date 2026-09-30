export type PackageConfig = {
  main?: string;
  type?: "commonjs" | "module";
};

// The resolver translates only this classification into Node's interpreted
// ERR_INVALID_PACKAGE_CONFIG. Unsupported analysis errors remain host errors.
export class InvalidPackageConfig extends Error {}

function hasLoneSurrogate(value: string): boolean {
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(++index);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return true;
    } else if (code >= 0xdc00 && code <= 0xdfff) return true;
  }
  return false;
}

function assertSupportedKeys(source: string): void {
  const keys = new Set<string>();
  let depth = 0;
  for (let index = 0; index < source.length; index++) {
    const character = source[index];
    if (character === "{" || character === "[") depth++;
    else if (character === "}" || character === "]") depth--;
    else if (character === '"') {
      const start = index;
      let escaped = false;
      // JSON has already been validated. Skip strings as units so braces,
      // quotes, and colons in values cannot be mistaken for top-level keys.
      while (++index < source.length && source[index] !== '"') {
        if (source[index] === "\\") {
          escaped = true;
          index++;
        }
      }
      let next = index + 1;
      while (/\s/.test(source[next] || "x")) next++;
      if (depth !== 1 || source[next] !== ":") continue;
      if (escaped) {
        throw new Error("CommonJS package metadata escaped top-level keys are not yet supported");
      }
      const key = source.slice(start + 1, index);
      if (keys.has(key)) {
        throw new Error("CommonJS package metadata duplicate top-level keys are not yet supported");
      }
      keys.add(key);
    }
  }
}

/**
 * Read the currently supported package.json metadata domain. Node's native
 * reader does not have precisely JSON.parse's semantics: escaped/duplicate
 * keys and even invalid escapes in unused fields can behave differently.
 * Classify only supported shapes; do not invent a Node error for the rest.
 */
export function readPackageConfig(source: string): PackageConfig {
  const body = source.replace(/^\uFEFF/, "");
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch (_) {
    throw new Error("CommonJS package metadata syntax outside valid JSON is not yet supported");
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new InvalidPackageConfig("Package metadata must be an object");
  }
  assertSupportedKeys(body);
  const fields = parsed as { [name: string]: unknown };
  for (const key of ["name", "type", "main"]) {
    const value = fields[key];
    if (typeof value === "string" && hasLoneSurrogate(value)) {
      throw new Error("CommonJS package metadata string decoding of lone surrogates is not yet supported");
    }
  }
  for (const key of ["name", "type"]) {
    if (Object.prototype.hasOwnProperty.call(fields, key) && typeof fields[key] !== "string") {
      throw new InvalidPackageConfig(`Package metadata ${key} must be a string`);
    }
  }
  const result: PackageConfig = {};
  if (typeof fields.main === "string") result.main = fields.main;
  if (fields.type === "commonjs" || fields.type === "module") result.type = fields.type;
  return result;
}
