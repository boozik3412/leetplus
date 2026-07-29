import { readFileSync } from "node:fs";

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) {
      deepFreeze(child);
    }
    Object.freeze(value);
  }
  return value;
}

let parsedRegistry;
try {
  const encodedRegistry = readFileSync(
    new URL(
      "./staff-task-integrity-snapshot-authority-roots.json",
      import.meta.url,
    ),
  );
  if (encodedRegistry.length === 0 || encodedRegistry.length > 256 * 1024) {
    throw new Error("invalid registry size");
  }
  const text = encodedRegistry.toString("utf8");
  if (!Buffer.from(text, "utf8").equals(encodedRegistry)) {
    throw new Error("invalid registry encoding");
  }
  parsedRegistry = JSON.parse(text);
} catch {
  throw new Error(
    "The pinned production-like authority root registry is unavailable.",
  );
}

export const PINNED_PRODUCTION_LIKE_AUTHORITY_ROOTS =
  deepFreeze(parsedRegistry);
