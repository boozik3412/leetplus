import { execFileSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

test("control handoff has a pure mocked regression matrix", () => {
  const root = path.dirname(fileURLToPath(import.meta.url));
  execFileSync(process.platform === "win32" ? "python" : "python3", [
    path.join(root, "test_control_handoff.py"),
  ], { stdio: "pipe" });
});
