#!/usr/bin/env node
import { createInterface } from "node:readline";
import { PitchMentor } from "@pitchmentor/sdk";
import { Server } from "./server.js";

if (!process.env.PITCHMENTOR_API_KEY) {
  console.error("PITCHMENTOR_API_KEY is required to run the Pitch Mentor MCP server.");
  process.exit(1);
}
const server = new Server(new PitchMentor());
const send = (msg: unknown) => process.stdout.write(JSON.stringify(msg) + "\n");

// stdio transport: one JSON-RPC message per line; requests are handled concurrently
for await (const line of createInterface({ input: process.stdin })) {
  if (!line.trim()) continue;
  let req;
  try {
    req = JSON.parse(line);
  } catch {
    send({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
    continue;
  }
  server.handle(req).then(
    (res) => res && send(res),
    (err) => send({ jsonrpc: "2.0", id: req.id ?? null, error: { code: -32603, message: String(err?.message ?? err) } })
  );
}
