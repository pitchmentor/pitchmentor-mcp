import { PitchMentor, PitchMentorError, VERSION, operations, type OperationId, type OperationMeta } from "@pitchmentor/sdk";

type Json = Record<string, unknown>;
interface RpcRequest {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: Json;
}

const PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];

const snake = (s: string) => s.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();

export interface Tool {
  name: string;
  operation: OperationId;
  description: string;
  inputSchema: Json;
  annotations: Json;
}

/** One tool per API operation; path, query and body fields are flattened into one argument object. */
export function buildTools(): Tool[] {
  return (Object.entries(operations) as [OperationId, OperationMeta][])
    .filter(([, meta]) => meta.tag !== "Meta") // the OpenAPI document itself is no use as a tool
    .map(([id, meta]) => {
    const properties: Record<string, Json> = {};
    const required: string[] = [];
    for (const p of meta.pathParams) {
      properties[p] = { type: "string" };
      required.push(p);
    }
    for (const s of [meta.query, meta.body]) {
      for (const [k, v] of Object.entries((s?.properties ?? {}) as Record<string, Json>)) {
        if (k in properties) throw new Error(`${id}: argument "${k}" is ambiguous`);
        properties[k] = v;
      }
    }
    required.push(...(((meta.body?.required ?? meta.query?.required) as string[] | undefined) ?? []));
    const notes = [
      meta.destructive && "DESTRUCTIVE: this cannot be undone. Only call it when the user explicitly asked for exactly this action.",
      /once/i.test(meta.summary) && "The result contains a secret that is shown only once; show it to the user and do not repeat it elsewhere.",
      meta.paginated && "Paginated: pass `cursor` = `next_cursor` from the previous result to get more.",
      meta.description,
    ].filter(Boolean);
    return {
      name: snake(id),
      operation: id,
      description: [`${meta.summary}.`, ...notes].join("\n\n"),
      inputSchema: { type: "object", properties, ...(required.length ? { required } : {}), additionalProperties: false },
      annotations: {
        title: meta.summary,
        readOnlyHint: meta.method === "GET",
        destructiveHint: meta.destructive,
        idempotentHint: meta.method !== "POST",
        openWorldHint: false,
      },
    };
  });
}

export class Server {
  readonly tools = buildTools();
  readonly #byName = new Map(this.tools.map((t) => [t.name, t]));
  constructor(private readonly client: PitchMentor) {}

  /** Returns the JSON-RPC response, or null for notifications. */
  async handle(req: RpcRequest): Promise<Json | null> {
    if (req.id === undefined || req.id === null) return null; // notifications get no response
    const ok = (result: unknown) => ({ jsonrpc: "2.0", id: req.id, result });
    const fail = (code: number, message: string) => ({ jsonrpc: "2.0", id: req.id, error: { code, message } });
    switch (req.method) {
      case "initialize": {
        const asked = String(req.params?.protocolVersion ?? "");
        return ok({
          protocolVersion: PROTOCOL_VERSIONS.includes(asked) ? asked : PROTOCOL_VERSIONS[0],
          capabilities: { tools: {} },
          serverInfo: { name: "pitchmentor", title: "Pitch Mentor", version: VERSION },
          instructions:
            "Tools for the Pitch Mentor sales-coaching API: calls and transcripts, analytics, leads, team, coaching styles, billing, referrals, webhooks and API keys. Tools marked DESTRUCTIVE need explicit user confirmation.",
        });
      }
      case "ping":
        return ok({});
      case "tools/list":
        return ok({ tools: this.tools.map(({ operation: _op, ...t }) => t) });
      case "tools/call": {
        const tool = this.#byName.get(String(req.params?.name));
        if (!tool) return fail(-32602, `Unknown tool: ${String(req.params?.name)}`);
        return ok(await this.call(tool, (req.params?.arguments ?? {}) as Json));
      }
      default:
        return fail(-32601, `Method not found: ${req.method}`);
    }
  }

  async call(tool: Tool, args: Json) {
    const meta: OperationMeta = operations[tool.operation];
    const text = (t: string, isError = false) => ({ content: [{ type: "text", text: t }], isError });
    const missing = ((tool.inputSchema.required ?? []) as string[]).filter((k) => args[k] === undefined);
    if (missing.length) return text(`Missing required argument(s): ${missing.join(", ")}`, true);

    const pick = (schema: Json | null) =>
      schema && Object.fromEntries(Object.keys((schema.properties ?? {}) as Json).filter((k) => args[k] !== undefined).map((k) => [k, args[k]]));
    const callArgs = [...meta.pathParams.map((p) => String(args[p])), ...(meta.body ? [pick(meta.body)] : []), ...(meta.query ? [pick(meta.query)] : [])];
    try {
      const fn = (this.client as unknown as Record<string, (...a: unknown[]) => Promise<unknown>>)[tool.operation];
      const result = await fn.apply(this.client, callArgs);
      return text(typeof result === "string" ? result : JSON.stringify(result, null, 2));
    } catch (err) {
      if (err instanceof PitchMentorError) return text(`Pitch Mentor API error ${err.status} (${err.code}): ${err.message}`, true);
      return text(`Request failed: ${(err as Error).message}`, true);
    }
  }
}
