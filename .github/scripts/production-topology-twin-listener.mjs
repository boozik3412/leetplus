#!/usr/bin/env node

import http from "node:http";
import process from "node:process";

const [kind, slot] = process.argv.slice(2);
const topology = {
  blue: { api: 4100, web: 3100 },
  green: { api: 4200, web: 3200 },
};

if (
  process.versions.node.split(".")[0] !== "22" ||
  !Object.hasOwn(topology, slot) ||
  !Object.hasOwn(topology[slot], kind) ||
  process.env.RELEASE_SLOT !== slot
) {
  process.stderr.write("production topology twin listener: invalid runtime identity\n");
  process.exit(2);
}

const portName = kind === "api" ? "API_PORT" : "WEB_PORT";
const port = Number(process.env[portName]);
if (port !== topology[slot][kind]) {
  process.stderr.write("production topology twin listener: invalid listener port\n");
  process.exit(3);
}

const server = http.createServer((request, response) => {
  if (request.method !== "GET" || request.url !== "/health/ready") {
    response.writeHead(404, { "content-type": "application/json" });
    response.end('{"status":"not_found"}\n');
    return;
  }
  response.writeHead(200, {
    "cache-control": "no-store",
    "content-type": "application/json",
  });
  response.end(`${JSON.stringify({ status: "ready", kind, slot })}\n`);
});

server.on("error", (error) => {
  process.stderr.write(`production topology twin listener: ${error.code ?? "listener_error"}\n`);
  process.exit(4);
});

server.listen(port, "127.0.0.1");

let stopping = false;
function stop() {
  if (stopping) return;
  stopping = true;
  const forcedExit = setTimeout(() => process.exit(5), 5_000);
  forcedExit.unref();
  server.close((error) => {
    if (error) process.exit(6);
    process.exit(0);
  });
}

process.on("SIGTERM", stop);
process.on("SIGINT", stop);
