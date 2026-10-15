# MCP Servers

This document covers how the app connects agents to MCP (Model Context Protocol) servers: the
StateSet catalog, how credentials are stored, how a server is verified, and where agents pick the
servers they can call.

## The catalog

`src/features/connections/statesetMcpServers.ts` lists every StateSet MCP server. Each entry
declares a transport, which decides how the app treats it.

### Hosted (HTTP)

Reachable by cloud agents. The user supplies an API key; the endpoint is fixed.

| Id                  | Server              | Endpoint                                                |
| ------------------- | ------------------- | ------------------------------------------------------- |
| `stateset-response` | StateSet ResponseCX | `https://response.stateset.com/api/mcp`                 |
| `stateset-engine`   | StateSet Engine     | `https://api.workstream.stateset.com/v1/mcp`            |
| `stateset-sync`     | StateSet Sync       | `https://api.sync.stateset.com/v1/tenants/{tenant}/mcp` |

Sync is per-tenant, so its card asks for a Sync tenant id and fills it into `{tenant}` (URL-encoded)
when the credentials are built.

### Local only (stdio)

These run as a local process, so a cloud agent cannot reach them. Their cards show a "Local only"
badge and a copyable `mcpServers` config block for Claude Desktop, Cursor, or any MCP client.

| Id                  | Server            | Command                                             |
| ------------------- | ----------------- | --------------------------------------------------- |
| `stateset-nsr`      | StateSet NSR      | `npx -y stateset-nsr-mcp`                           |
| `stateset-commerce` | StateSet Commerce | `npx -y @stateset/cli@latest stateset-mcp-events`   |
| `stateset-voice`    | StateSet Voice    | `node …/rust-phone-server/mcp-server/dist/index.js` |
| `stateset-edi`      | StateSet EDI      | `node …/stateset-edi/mcp/dist/index.js`             |

Voice and EDI are not published to npm; their cards say to build them from their repos first.

## How credentials are stored

A hosted server saves the same shape as a custom MCP server:

```json
{ "endpoint": "https://…/mcp", "auth_token": "…" }
```

Credentials go to the backend vault, or to encrypted local storage when the vault is not configured
(`src/lib/localSecrets.ts`). Agents reference a server by its id in `mcp_servers`.

To add a server outside the catalog, use **Add custom MCP server** on the Connections page. Any id
works as long as the agent's `mcp_servers` list uses the same one.

## Verifying a server

`electron/mcp-probe.ts` runs a real MCP handshake over the streamable-HTTP transport:

1. `initialize` (protocol `2025-06-18`), keeping any `mcp-session-id` the server returns
2. `notifications/initialized`
3. `tools/list`

It parses plain JSON and SSE-framed responses, and reports the server name, version and tool names.
Failures come back as plain language rather than status codes.

The probe runs in the main process behind the `mcp:probe` IPC channel, so credentials go straight
from the form to the target server. Constraints worth knowing:

- **https only**, and public hosts only. Private and internal addresses are refused: RFC1918,
  loopback, link-local (including cloud metadata), CGNAT/Tailscale (100.64/10), benchmarking,
  multicast, unique-local and site-local IPv6, `.local` and `.internal` — including their
  fully-qualified `name.internal.` form and IPv4 addresses embedded in IPv6 (`::ffff:10.0.0.1`,
  `::10.0.0.1`).
- the main process also **resolves the hostname** and refuses it if any resolved address is private,
  so a name like `127.0.0.1.nip.io` or `localtest.me` cannot smuggle one in. It fails closed: an
  address that cannot be resolved is not probed.
- `localhost` endpoints work **in development only**. A packaged app refuses them, since the
  renderer's own `connect-src` policy would never allow it to reach local services.
- URLs carrying credentials are rejected.
- redirects are followed by hand (`redirect: 'manual'`), stay on the configured origin, and share
  **one budget of 3 hops across the whole probe**, so the token can never travel and three messages
  cannot become a dozen requests.
- one **10 second deadline covers the whole handshake**, including hostname resolution, and the
  abort signal stays armed while the body is read. At most **1 MiB** of response body is buffered.
- the channel has its own rate limit (10/s per sender) and a cap of 4 concurrent probes, separate
  from the general IPC budget.
- every failure that never reached the server is marked `unreachable`, so the UI never treats it as
  the server disproving a stored verification.
- replies are validated, not just parsed: `result` must be an object, the `notifications/initialized`
  hop must succeed, and server-reported strings are type-checked and capped at 200 characters before
  they are shown or stored.

SSE frames are matched on JSON-RPC id (string or number) and must be replies, because a stream may
carry notifications, progress frames or server-initiated requests before the answer. The content
type is matched case-insensitively.

**Test server** appears in the custom-MCP form and on hosted StateSet cards, so a server can be
verified before its credentials are saved. For an already-connected server in local mode, **Test**
reads the stored credentials and runs the same handshake. Servers without an MCP endpoint (Shopify,
Gorgias, …) can only be tested through the vault.

Verifications live in one shared store (`src/stores/mcpVerifications.ts`), so a handshake recorded
on a card immediately reaches the tool catalog, the pickers and the dashboard without a remount.
The store reads once and every write waits for that read, which is what keeps a slow read from
undoing a delete — no reconciliation bookkeeping needed. A write is skipped entirely if the stored
copy was never read, so a failed read cannot replace what is on disk. Logging out clears the map,
in memory and on disk, since server names and tool lists are account-scoped.

A successful handshake is remembered per brand under the `mcpVerifications` store key, and the card
then shows `12 tools · verified 2h ago` with an expandable tool list. Tool names are capped at 25
per server to keep the store small. After a week the line turns amber and reads "test again", since
an old check says little about whether the server still answers. Disconnecting a server drops its
verification, and the card only shows one while the server is connected.

## Where agents pick servers

`McpServerPicker` is used in three places, fed by `useMcpServerOptions` (hosted StateSet servers
first, then connected platforms and custom servers):

- **Create agent** — Advanced settings, with a warning naming any selected server that is not
  connected yet
- **Agent settings** — the agent console's settings modal
- **Chat playground** — the "MCP servers" control in the config bar

In chat, the selection is passed into the interactive session at creation. Changing it mid-
conversation updates the live session rather than starting over, but lazily: the config call happens
as the next message is sent, not on every toggle. An idle session's tools do not matter, and doing
it at send time means there is only ever one such call in flight against the session actually in
use — no concurrent pushes to serialize, no abandoned sessions to fence. A failure is reported and
retried on the following send, so a message never runs on the previous tool set.
Saved transcripts keep each tool's name, status and duration — never its arguments or result, which
can carry tokens or customer data. Tool calls then
appear inline in the transcript with their arguments, result preview and duration.

### Testing every server at once

In local mode the Connections page offers **Test all servers**: it reads every locally stored
connection that has an endpoint (`localSecretsApi.listMcpEndpoints`), probes them one at a time,
records each success, and reports `2 of 3 responded, 1 failed`. One unreachable server does not stop
the rest.

The button only appears in local mode, because vault-held tokens never reach the renderer — there is
nothing for the app to probe with when the vault holds the credentials.

Only an `http(s)` endpoint can be probed, so a custom server stored as a local command is reported
as untestable — by the per-card test and by the bulk sweep, which leaves it out of its totals
entirely. A test that verified nothing says so ("Nothing to test") rather than reporting success.

A per-card **Test** in local mode records what it learned too, so the badge refreshes — and a test
the server _answers_ with a failure drops the stored handshake, so a card never keeps claiming tools
a server no longer serves. A server that simply could not be reached (offline, timeout) proves
nothing, so its record is kept. The bulk sweep follows the same rule. A custom
server verified before saving carries that handshake over once it is added. An endpoint stored as a
local command (`npx …`) is reported as untestable rather than failed.

## Tool catalog

`McpToolCatalog` sits at the top of the Connections page: a collapsed summary ("12 tools across 3
servers") that opens into every tool the connected servers reported, searchable across servers by
tool name or server name. It answers "which server has the tool I need?", which the per-card lists
cannot. It only knows about verified servers, so it prompts you to test one when nothing has been
verified yet, and renders nothing at all when no MCP server is connected.

## Warnings in the agent console

`McpServerStatusNotice` sits under the agent console toolbar and under the chat playground's config
bar. When the selected `mcp_servers` include a server with no stored credentials, it names them and
links to Connections — those tool calls would otherwise fail mid-run with nothing in the UI
explaining why. It stays silent while the connections query is still loading (everything looks unconnected then),
and when every server is connected. It also warns when credentials live only on this device, since a
hosted agent cannot read those. It reports local-only servers
(`stateset-nsr`, `stateset-voice`, …) separately: those are not missing credentials, they simply
cannot be reached by a hosted agent, so no Connections link is offered for them.

## Dashboard

`McpServersOverview` (dashboard sidebar) summarizes the fleet's tool access: how many servers are
connected, how many have a recent handshake, how many need a test, and the tool total across
verified servers. With nothing connected it links straight to the Connections page. The counts come
from `summarizeMcpServers`, which reads the same options the pickers use.

## Templates

`BUILT_IN_TEMPLATES` (`src/lib/agentTemplates.ts`) ships one agent per hosted server, so a freshly
connected server has something to run:

| Template          | Server              | What it does                                             |
| ----------------- | ------------------- | -------------------------------------------------------- |
| Sync Operations   | `stateset-sync`     | Watches stalled orders, failed jobs, inventory drift     |
| Knowledge Curator | `stateset-response` | Proposes rules and knowledge, runs evals after a change  |
| Workstream Ops    | `stateset-engine`   | Tracks engine workflows and sessions, escalates failures |

Each one's instructions keep it read-only by default — it reports and proposes rather than mutating
or retrying on its own.

## Adding a server to the catalog

1. Add an entry to `STATESET_MCP_SERVERS` with its transport, and an endpoint or command.
2. Hosted entries are automatically treated as built-in (`isBuiltInPlatform`), render in the
   StateSet section, and get the probe button.
3. Add the id to the catalog test's expected list.

No changes are needed in the picker, the agent config, or the vault path — they all work from the
server id.
