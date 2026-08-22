"use strict";

// Exact 7de04ff4 calls app.listen(PORT) without a host. This preload is part of
// the reviewed scheduler-free control bundle and turns that wildcard bind into
// one fail-closed loopback listener before the legacy entry point is loaded.

const net = require("node:net");

const expectedPort = Number(process.env.LEGACY_ROLLBACK_CHILD_PORT);
const testMode = process.env.LEGACY_ROLLBACK_CHILD_PRELOAD_TEST_MODE === "true";
if ((!testMode && expectedPort !== 4301) ||
  (testMode && (process.getuid?.() === 0 || !Number.isSafeInteger(expectedPort) || expectedPort < 1 || expectedPort > 65535)) ||
  process.env.PORT !== String(expectedPort)) {
  throw new Error("LEGACY_ROLLBACK_CHILD_PORT_CONTRACT_INVALID");
}
delete process.env.LEGACY_ROLLBACK_CHILD_PORT;
delete process.env.LEGACY_ROLLBACK_CHILD_PRELOAD_TEST_MODE;

const originalListen = net.Server.prototype.listen;
let listenConsumed = false;

function loopbackOnlyListen(...arguments_) {
  if (listenConsumed) throw new Error("LEGACY_ROLLBACK_MULTIPLE_LISTEN_FORBIDDEN");
  const first = arguments_[0];
  const observedPort = typeof first === "object" && first !== null ? Number(first.port) : Number(first);
  if (observedPort !== expectedPort) throw new Error("LEGACY_ROLLBACK_LISTEN_PORT_FORBIDDEN");
  const callback = [...arguments_].reverse().find((value) => typeof value === "function");
  const options = {
    exclusive: true,
    host: "127.0.0.1",
    port: expectedPort,
  };
  if (typeof arguments_[1] === "number" && Number.isSafeInteger(arguments_[1]) && arguments_[1] > 0) {
    options.backlog = arguments_[1];
  } else if (typeof first === "object" && first !== null && Number.isSafeInteger(first.backlog) && first.backlog > 0) {
    options.backlog = first.backlog;
  }
  listenConsumed = true;
  return callback ? originalListen.call(this, options, callback) : originalListen.call(this, options);
}

Object.defineProperty(net.Server.prototype, "listen", {
  configurable: false,
  enumerable: false,
  value: loopbackOnlyListen,
  writable: false,
});
