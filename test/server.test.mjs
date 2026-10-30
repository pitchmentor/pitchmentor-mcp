import { test } from "node:test";
import assert from "node:assert/strict";
import { PitchMentor } from "@pitchmentor/sdk";
import { Server } from "../dist/server.js";

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
function server(...responses) {
  const calls = [];
  const fetch = async (url, init) => (calls.push({ url: new URL(url), ...init }), responses.shift());
  return { s: new Server(new PitchMentor({ apiKey: "pm_live_test", baseUrl: "http://api.test", fetch, maxRetries: 0 })), calls };
}
const rpc = (method, params, id = 1) => ({ jsonrpc: "2.0", id, method, params });

test("initialize negotiates the protocol; notifications get no reply", async () => {
  const { s } = server();
  const res = await s.handle(rpc("initialize", { protocolVersion: "2025-03-26" }));
  assert.equal(res.result.protocolVersion, "2025-03-26");
  assert.equal((await s.handle(rpc("initialize", { protocolVersion: "1999-01-01" }))).result.protocolVersion, "2025-06-18");
  assert.equal(await s.handle({ jsonrpc: "2.0", method: "notifications/initialized" }), null);
  assert.equal((await s.handle(rpc("nope"))).error.code, -32601);
});

test("tools/list: one tool per operation, destructive ones marked", async () => {
  const { s } = server();
  const { tools } = (await s.handle(rpc("tools/list"))).result;
  assert.equal(tools.length, 41);
  const byName = Object.fromEntries(tools.map((t) => [t.name, t]));
  for (const name of ["revoke_api_key", "delete_webhook_endpoint", "remove_member"]) {
    assert.equal(byName[name].annotations.destructiveHint, true, name);
    assert.match(byName[name].description, /DESTRUCTIVE/);
  }
  assert.equal(byName.list_calls.annotations.readOnlyHint, true);
  assert.deepEqual(byName.update_lead.inputSchema.required, ["id"]);
  assert.deepEqual(byName.upsert_lead.inputSchema.required, ["name"]);
  assert.ok(byName.list_calls.inputSchema.properties.cursor);
});

test("tools/call routes path, query and body arguments", async () => {
  const { s, calls } = server(json({ data: [], has_more: false, next_cursor: null }), json({ id: "l1", name: "B" }));
  await s.handle(rpc("tools/call", { name: "list_webhook_deliveries", arguments: { id: "w1", status: "failed", limit: 3 } }));
  assert.equal(calls[0].url.pathname, "/v1/webhooks/w1/deliveries");
  assert.equal(calls[0].url.search, "?limit=3&status=failed");
  const res = await s.handle(rpc("tools/call", { name: "update_lead", arguments: { id: "l1", name: "B", stage: null } }));
  assert.equal(calls[1].method, "PATCH");
  assert.deepEqual(JSON.parse(calls[1].body), { name: "B", stage: null });
  assert.equal(res.result.isError, false);
  assert.equal(JSON.parse(res.result.content[0].text).id, "l1");
});

test("API errors and missing arguments come back as isError results", async () => {
  const { s } = server(json({ error: { code: "insufficient_scope", message: "API key is missing the calls:write scope" } }, 403));
  const res = await s.handle(rpc("tools/call", { name: "archive_call", arguments: { id: "c1" } }));
  assert.equal(res.result.isError, true);
  assert.match(res.result.content[0].text, /403 \(insufficient_scope\)/);
  const missing = await s.handle(rpc("tools/call", { name: "get_call", arguments: {} }));
  assert.match(missing.result.content[0].text, /Missing required argument\(s\): id/);
});
