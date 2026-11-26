#!/usr/bin/env node
// Checks the Compose files as merged by Compose itself (needs no running engine).
// Usage: node launcher/tests/compose/check.js
const assert = require("assert");
const path = require("path");
const { execFileSync } = require("child_process");
const root = path.join(__dirname, "..", "..", "..");

function service(...files) {
  const args = ["compose", ...files.flatMap((f) => ["-f", path.join(root, f)]), "config", "--format", "json"];
  return JSON.parse(execFileSync("docker", args, { encoding: "utf8" })).services["innodigym-editor"];
}

// Plain `docker compose up` stays as it was.
const base = service("docker-compose.yml");
assert.strictEqual(base.ports.length, 1);
assert.ok(!base.ports[0].host_ip, "base config must not restrict the host address");
assert.strictEqual(base.restart, "unless-stopped");
assert.ok(!(base.environment || {}).MYINNOX1_LAUNCHER);

// The launcher publishes on loopback only, never restarts, and enables the routes.
const merged = service("docker-compose.yml", "launcher/compose.launcher.yml");
assert.strictEqual(merged.ports.length, 1, "the launcher port must replace the base port, not add to it");
assert.strictEqual(merged.ports[0].host_ip, "127.0.0.1");
assert.strictEqual(String(merged.ports[0].published), "8787");
assert.strictEqual(merged.ports[0].target, 8787);
assert.strictEqual(merged.restart, "no");
assert.strictEqual(merged.init, true);
assert.strictEqual(merged.environment.MYINNOX1_LAUNCHER, "1");
console.log("ok: compose files");
