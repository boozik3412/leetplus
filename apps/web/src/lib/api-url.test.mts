import assert from "node:assert/strict";
import test from "node:test";

import { resolveApiUrl } from "./api-url.ts";

test("uses the server-only slot API origin in production", () => {
  assert.equal(
    resolveApiUrl({
      API_URL: "http://127.0.0.1:4100",
      NEXT_PUBLIC_API_URL: "http://127.0.0.1:4000",
      NODE_ENV: "production",
    }),
    "http://127.0.0.1:4100",
  );
});

test("fails closed when the production slot API origin is absent", () => {
  assert.throws(
    () =>
      resolveApiUrl({
        NEXT_PUBLIC_API_URL: "http://127.0.0.1:4000",
        NODE_ENV: "production",
      }),
    /API_URL is required in production/,
  );
});

test("keeps a narrowly scoped development fallback", () => {
  assert.equal(
    resolveApiUrl({
      NEXT_PUBLIC_API_URL: "http://127.0.0.1:4000",
      NODE_ENV: "development",
    }),
    "http://127.0.0.1:4000",
  );
});

test("rejects credentials, paths and non-HTTP API URLs", () => {
  for (const API_URL of [
    "postgresql://127.0.0.1:4100",
    "http://user:secret@127.0.0.1:4100",
    "http://127.0.0.1:4100/api",
    "http://127.0.0.1:4100/?slot=blue",
  ]) {
    assert.throws(
      () => resolveApiUrl({ API_URL, NODE_ENV: "production" }),
      /must be an absolute HTTP\(S\) origin/,
    );
  }
});
