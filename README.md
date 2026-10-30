# @pitchmentor/mcp

Official [Model Context Protocol](https://modelcontextprotocol.io) server (stdio) for the
[Pitch Mentor](https://pitchmentor.net) API, built on [`@pitchmentor/sdk`](https://www.npmjs.com/package/@pitchmentor/sdk).
It gives AI assistants (Claude Desktop, Claude Code, Cursor, …) one tool per API operation. Node 20+.

API reference: https://pitchmentor.net/docs

## Install

No install needed with `npx` (below). Or install it globally to get the `pitchmentor-mcp` command:

```bash
npm install -g @pitchmentor/mcp
```

## Authentication

The server requires `PITCHMENTOR_API_KEY`: a team API key (`pm_live_…`, created in the Pitch Mentor dashboard), sent
as `Authorization: Bearer pm_live_…`. Use a key with only the scopes you want the assistant to have, e.g. read-only
scopes (`calls:read`, `analytics:read`, …) for an analysis assistant. `PITCHMENTOR_BASE_URL` optionally overrides the
API host.

## Claude Desktop

Add to `claude_desktop_config.json` (Settings → Developer → Edit Config):

```json
{
  "mcpServers": {
    "pitchmentor": {
      "command": "npx",
      "args": ["-y", "@pitchmentor/mcp"],
      "env": { "PITCHMENTOR_API_KEY": "pm_live_…" }
    }
  }
}
```

## Claude Code

```bash
claude mcp add pitchmentor -e PITCHMENTOR_API_KEY=pm_live_… -- npx -y @pitchmentor/mcp
```

Or check it into a project's `.mcp.json` (keep the key in your environment, not in the file):

```json
{
  "mcpServers": {
    "pitchmentor": {
      "command": "npx",
      "args": ["-y", "@pitchmentor/mcp"],
      "env": { "PITCHMENTOR_API_KEY": "${PITCHMENTOR_API_KEY}" }
    }
  }
}
```

## Tools

Each API operation (except fetching the OpenAPI document) is a tool named after its `operationId` in snake_case, with
the operation's parameters as its input schema. For example:

| Area | Tools |
|---|---|
| Calls | `list_calls`, `get_call`, `export_calls`, `summarize_call`, `archive_call`, `unarchive_call` |
| Analytics | `get_analytics_overview`, `get_analytics_by_member` |
| Leads | `list_leads`, `get_lead`, `upsert_lead`, `batch_upsert_leads`, `update_lead` |
| Team | `get_me`, `get_team_config`, `update_team_config`, `list_members`, `remove_member`, `list_invites`, `create_invite`, `cancel_invite` |
| Coaching | `list_coaching_styles`, `create_coaching_style`, `update_coaching_style` |
| Billing & referrals | `get_billing_status`, `get_usage`, `list_member_usage`, `get_referral_stats` |
| Webhooks | `list_webhook_endpoints`, `get_webhook_endpoint`, `create_webhook_endpoint`, `update_webhook_endpoint`, `delete_webhook_endpoint`, `rotate_webhook_secret`, `test_webhook_endpoint`, `list_webhook_deliveries`, `replay_webhook_delivery` |
| API keys | `list_api_keys`, `create_api_key`, `rotate_api_key`, `revoke_api_key` |

Read-only tools carry `readOnlyHint`. Destructive tools (`revoke_api_key`, `rotate_api_key`, `delete_webhook_endpoint`,
`rotate_webhook_secret`, `remove_member`, `cancel_invite`) carry `destructiveHint` and a DESTRUCTIVE warning in their
description, so clients ask before running them.

## Pagination

List tools return one page (`data`, `has_more`, `next_cursor`); the assistant passes `next_cursor` as `cursor` to read on.

## Retries, idempotency and errors

Calls go through `@pitchmentor/sdk`: 429, 5xx and network errors are retried (2 times) honoring `retry-after`, and every
POST carries an `Idempotency-Key` reused across retries, so a retried tool call never runs twice. API errors come back as
tool results with `isError: true` and the API's status, code (e.g. `insufficient_scope`) and message, so the assistant
can explain or adjust.

## Webhooks

The assistant can manage webhook endpoints and deliveries with the tools above. To verify incoming webhook signatures in
your own server, use `verifyWebhook` from [`@pitchmentor/sdk`](https://www.npmjs.com/package/@pitchmentor/sdk).

## License

MIT
