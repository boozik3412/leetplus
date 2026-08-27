import assert from "node:assert/strict";
import test from "node:test";
import { main } from "./telegram-update-ledger-runtime-acl-reconciliation.cli.mjs";

test("CLI help is available without database access", async () => {
  let output = "";
  const originalWrite = process.stdout.write;
  process.stdout.write = (chunk) => {
    output += String(chunk);
    return true;
  };
  try {
    assert.equal(await main(["--help"], {}), 0);
  } finally {
    process.stdout.write = originalWrite;
  }
  assert.match(output, /--mode <plan\|check\|apply>/u);
  assert.match(output, /never creates roles or broad grants/u);
});
