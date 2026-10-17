# Durable computer chats

Every **New chat** creates a `ComputerChatWorkflow` in `next-temporal-rs` and a
dedicated `computer-use` agent session in `stateset-sandbox`. The workflow owns
model planning, policy admission, approvals, execution, output collection and
acceptance checks. Closing the desktop stops its display polling; the worker
continues the conversation. Reopening reconciles the saved workflow identity.

## Service setup

Deploy these changes together:

| Repository                   | Required components                                                                                               |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `/home/dom/next-temporal-rs` | `engine-api` computer-chat endpoints and a worker registering `ComputerChatWorkflow`                              |
| `/home/dom/stateset-sandbox` | Controller workspace/recovery/capability routes, budgeted inference proxy, computer-use image and durable storage |
| `/home/dom/stateset-nsr`     | Authenticated sandbox action policy and computer artifact verification routes                                     |

Start the services using each repository's deployment configuration. The desktop
does not launch them or execute commands on the host. Temporal, the engine
control-plane database and the sandbox's database/Kubernetes/storage dependencies
must be available.

In the engine's control plane, configure enabled outbound connectors for the
selected brand. The brand must belong to the desktop's organization.

- `sandbox`: base URL of the sandbox controller, without `/api/v1`. Its credential
  needs session read/write, sandbox read/write, files read, checkpoint creation
  and recovery permissions for the sandbox organization.
- `nsr`: base URL of NSR, without `/api/v1`. Use a credential for the **same sandbox
  organization**. Every policy request is bound to the sandbox session's returned
  organization ID.
- Optional `mcp` connectors: set `metadata.mcp_path` (defaults to `/mcp`) and
  `metadata.computer_chat.allowed_tools` to an explicit array of permitted tool
  names. The workflow performs the MCP handshake and tool discovery itself.
  Selected tools always require human approval and policy evaluation.

Keep connector credentials in engine secret references. Do not configure a
constant `Idempotency-Key`: the workflow supplies an operation-specific key.
Allow at least 150 seconds for bounded service activities. Workflow task routing
uses the selected brand's `response-automation-v2` queue binding; a worker on
that queue must register the new family.

The sandbox organization needs its `ANTHROPIC_API_KEY` organization secret,
a plan with durable computer capacity, durable support enabled, the computer-use
image, and the inference reservation database migration. That image supplies
Python, pyautogui, Xvfb and xdotool. Configure model prices in the sandbox if using
a model outside its price table. Credentials stay in the services.

In **Chats → Settings → Computer setup and defaults**, save the workflow API URL and key,
then select **Save connection and check**. Diagnostics check brand access,
connector authentication, durable entitlement/capacity, the computer image,
inference secret and evidence APIs. Save defaults for the current organization
and brand, then create a chat. Electron encrypts the workflow key using operating
system secure storage and sends service requests from the main process. If the
system keyring is unavailable, setup explains that the key is held for the current
app session only. Re-enter it after restarting to reconnect saved computers;
server workflows continue while the desktop is disconnected. A browser
preview uses renderer networking and requires matching CORS/CSP configuration;
its in-memory chats do not provide persistent restart recovery.

A saved chat without a workflow key shows **Connection needs attention** and
**Open connection settings**. Automatic retries pause until the credential changes.
Restoring the key refreshes saved workflow status without resending instructions.

Connection changes invalidate in-flight desktop observations and cached review
readiness, including switching away and back to the same organization or engine.
A late response or authentication failure cannot replace a newer connection state.
Instructions waiting for a local save keep their stable pending identity but are
not submitted if the organization, brand, credential or engine changes before
submission. Review the original conversation and explicitly retry after reconnecting.
An action already accepted by the server continues under its original workflow;
a desktop connection change does not undo that action.

Connection saves and credential removal run in order. While they are pending,
computer requests wait for a consistent saved connection. The native bridge binds
each request to a process-local connection revision and rejects an old binding
before forwarding it, including before an authentication retry. Revisions contain
no credential material and are not persisted with conversations or sent to services.

`VITE_DURABLE_ENGINE_URL` sets the initial engine URL. `VITE_SANDBOX_API_URL` and
`VITE_POLICY_API_URL` remain for older app features; durable chats resolve both
services through the engine's brand connectors.

Connection readiness belongs to the organization, brand, saved engine URL,
credential and selected tools that were checked. Changing any of those requires
a new check before creating another computer. Late results from an edited or
previous workspace are discarded. Tool discovery remains visible while selecting
multiple tools; changing the selection invalidates readiness without hiding the
remaining choices. The desktop validates diagnostic response fields before using
them. Checks describe the service state at that moment; the workflow still
enforces permissions and service availability when it starts work.

New-chat settings are checked against the engine limits before defaults are saved
or a computer is created. Acceptance supports eight checks across four distinct
files. File paths must stay under `/workspace`, without `.`/`..` segments,
backslashes or control characters, and fit within 1,024 UTF-8 bytes. Each expected
value must fit within 16,384 bytes after JSON encoding, including escaping.
Setup keeps invalid criterion drafts editable and shows the error beside them.
Model names are limited to 255 UTF-8 bytes; executable and connector names use
1–100 ASCII letters, digits, dots, hyphens or underscores. Older saved conversations
and defaults remain readable so settings can be corrected without losing transcripts.

Saving defaults shows progress and confirms success only for the submitted settings.
You can keep editing while the save is pending; newer edits stay in the form and
remain unsaved until you save them. Saves for different brands run in order and
retain each brand's committed defaults. If saving fails, the form keeps your changes
and offers a retry. Removing a criterion returns keyboard focus to **Add criterion**.

## Finding and organizing conversations

The conversation is the main workspace. Open **Settings** for connection setup,
new-chat defaults and acceptance criteria. Defaults and permissions are collapsed
until needed. The conversation list can be hidden with the sidebar button.

Chats remembers the last conversation you opened in each organization and brand,
including its unsent draft. This selection is saved locally without changing the
chat's execution activity. Opening or restoring a conversation never resends its
messages or starts computer work.

Use **Ctrl/Cmd+K** to search and open saved conversations from anywhere in the app.
The palette includes archived chats and only shows summaries from the current
organization and brand. It displays up to 30 matching chats; searching can find
conversations beyond that initial list. **Ctrl/Cmd+F** within the chat workspace
opens and focuses conversation search. Escape clears a nonempty search.

Command search keeps the selected conversation or agent when live results reorder.
If that result disappears, selection returns to the first available match; a new
search also starts at its first match. Long names stay within the palette, with
full names and status available to assistive technology. Keyboard scrolling
respects reduced motion and does not restart for status-only updates.

Conversation selection is reflected in the app route (`/playground?chat=…`), so
back and forward navigation return to the corresponding chat. A link for a
missing chat or another workspace displays an unavailable state; it cannot open
foreign transcripts. Switching organizations or brands clears the previous
selection from the route and restores the selected workspace's last opened chat.

Open **Computer** in a conversation to view the desktop, timeline or files.
The details panel stays closed until requested and overlays the conversation in
smaller windows. Arrow keys, Home and End navigate its tabs; Escape closes the
panel and returns keyboard focus to its button. Usage limits and session IDs
are available in expandable sections. On narrow windows, selecting a conversation
closes the list so the composer remains accessible.
On narrow windows, the conversation drawer and computer details open one at a
time. Resizing keeps the focused drawer, or the computer details when focus is
elsewhere, so one panel cannot cover the other.

The **Timeline** shows the newest workflow events first, with readable action,
policy and acceptance summaries. Search includes the full retained evidence,
including events outside the initial 50. Filter actions, policy decisions,
deliverables or events needing attention, and use **Show earlier events** to load
another 50. Loading focuses the first revealed event. Search and filters stay
with the current timeline while it refreshes and reset when changing conversations.
Escape clears a nonempty event search before closing the computer panel.
**Evidence and details** retains the original event payload. Historical acceptance
events describe their recorded files; the Files panel shows whether checks cover
the current file versions. Missing older observations are called out explicitly.

Search the chat library by name, transcript text, session ID or workflow ID.
Filters show active computers, chats needing attention, ended computers and
archived chats within the selected organization and brand. Pin frequently used
chats, or rename them through the chat's options menu. A custom name is retained
when the first message is sent. Idle refreshes do not change activity ordering.

Conversation options support arrow keys, Home, End and typing an action's name.
Escape closes the menu and returns focus to its button. Rename selects the current
name for editing; Escape discards the edit. Deletion initially focuses **Keep chat**
and still requires explicit confirmation. Archiving, deleting or renaming a chat
out of the current search returns focus to conversation search. Finishing a save
does not move focus back if you have already moved to another control.

Unsent drafts belong to their conversation and remain available when switching
chats or reopening the app. Draft changes are saved locally within 350 ms;
leaving the composer or hiding the app also requests an immediate save. A failed
save leaves the draft in memory and displays the local-save notice. Recovered
drafts are never sent automatically. Sending first retains a stable pending
message, then clears the submitted draft. Messages allow up to 8,000 UTF-8 bytes;
the composer shows the size and blocks oversized submissions without dropping
the text.

Archiving hides a chat from the main list; its computer continues running and
its status is still reconciled. Restore it from the archived view. Deletion is
available after shutdown is confirmed and asks before removing the local
transcript and evidence cache.

Network failures show a reconnect notice alongside saved observations. Status
polling pauses while offline, retries transient failures with increasing delays
(up to one minute), and limits concurrent requests to four. Background polling
starts at most four requests per three seconds and rotates fairly across eligible
chats. One slow response does not block other free polling slots. Credential and
contract failures require attention; updating the connection or selecting
**Retry now** refreshes status. Reconnecting never resubmits a computer action.
Responses arriving after an organization or brand change are discarded. Local
save failures are reported separately and can be retried without restarting
computer work; unsaved observations stay available in memory.

Long transcripts initially render the latest 100 messages. **Show older messages**
loads earlier cached entries. Reading earlier messages stops automatic scrolling;
**Jump to latest** returns to live updates.

Conversation status is consistent in the chat header, library and command search.
The **Needs attention** filter counts nonarchived chats in the selected organization
and brand, including pending approvals, unconfirmed messages, failed acceptance
checks, exhausted budgets and unconfirmed cleanup.

Connection warnings show the age of the last successful sync for the current
desktop connection. **Open connection settings** reveals setup and focuses the
workflow URL; it does not switch connections automatically. **Retry now** refreshes
status, shows progress and prevents duplicate manual checks. Retry countdowns are
visual and do not repeat screen-reader announcements every second. Press Escape
to close settings or the narrow conversation drawer and return to its toggle;
Escape during text composition leaves the current panel open.

## Execution, approval and recovery

The transcript, desktop observation, timeline, workspace browser and deliverables
share the same chat and workflow identity. Stable start/message UUIDs survive a
lost acknowledgement. A pending message stays saved until the server transcript
confirms receipt. **View unconfirmed message** exposes its complete saved text.
Ended or stopping computers refuse further sends, including retries; an ended
computer retains any unconfirmed message for inspection and copying into a new
chat. Mutations are scoped to the current organization, brand and
original engine URL. API scope checks also enforce tenant ownership.

**Pause** prevents further tool actions after the current activity completes.
**Resume** continues the server conversation. **Stop** requests cleanup; the UI
reports confirmed cleanup only after both the session and sandbox are stopped.
Unconfirmed shutdown is shown as requiring inspection. Already completed effects
are retained.

Policy `deny` cannot be approved. Reviews bind an authenticated reviewer to the
pending request ID and canonical action hash, and expire after ten minutes.
Command rewrites require explicit acceptance and another policy evaluation;
the replacement must also satisfy both chat and brand executable permissions.
The review card shows the remaining approval time and keeps the action hash and
evidence IDs in **Policy evidence**. Consent resets when the displayed action,
replacement, policy receipt or review window changes. Submission rechecks that
exact version after local persistence completes, and refuses expired, completed,
stopping or disconnected reviews. Cached approvals require a successful connection;
**Refresh status** checks the workflow without sending a review. The workflow
remains the authority on policy, identity and expiry.
Select **Approval needed** in the conversation header to bring the review into
view and focus its heading. A revised action returns keyboard focus to its new
review; a completed review returns it to the conversation heading. These handoffs
only happen when focus was in that review and remain within the same conversation.
Approvals arriving in the background leave typing and other controls alone.
The visual countdown does not announce every second; assistive technology can
read the exact approval deadline.
If a focused decision control expires, focus moves to **Refresh status** (or the
explanation while offline), so keyboard navigation can continue from the review.
A result is recorded before output policy verification, so retrying an unavailable
verifier does not execute the completed action again.

**Save checkpoint** excludes environment restoration and sensitive workspace
files. **Recover computer** reconnects the existing computer where possible, or
restores a session-bound checkpoint into a replacement sandbox while retaining
the session and its consumed budget. An ended/suspended session cannot be revived.
Continuing an ended conversation explicitly creates a new computer with imported
transcript context. Previous computer chats and older playground histories can
be imported through the same chat list; importing does not automatically execute
the old instructions. Imported context keeps the latest 30 user/assistant messages.
Each is bounded to the engine's 8,000-byte UTF-8 limit, including its role label,
without cutting through a Unicode character. The original conversation is retained.

## Acceptance checks and files

Configure acceptance criteria before creating a chat. The agent publishes files
with `publish_artifact`; the server reads exact bytes within `/workspace` and NSR
independently recomputes SHA-256 and checks the selected criteria:

- `contains` and `equals`: UTF-8 text containment or exact equality.
- `json`: parsed JSON equality, optionally at a JSON Pointer.
- `sha256`: an expected digest.
- `png`: PNG container/chunk CRC validation and optional minimum dimensions
  (`{"min_width": 800, "min_height": 600}`). This does not judge visual content.

No criteria produces **Observed**, never **Verified**. A missing file or failed
criterion fails acceptance. Receipts bind the organization, session, request and
file digests. The Files panel marks checks against older bytes as **Checks outdated**;
passed checks must cover every configured criterion for the current digest before
a file is shown as verified.

Browse folders with breadcrumbs, the parent button or an entered `/workspace`
directory; press Enter to browse and filter larger directory listings by name.
Workspace paths use at most 1,024 UTF-8 bytes and reject control characters,
backslashes and `.`/`..` segments before sending a workspace request. Invalid
addresses stay editable, with the error associated with the address field.
The address follows newly observed folders unless you are editing it. Opening a
folder by keyboard returns focus to the address when its old row disappears;
moving focus elsewhere while it loads keeps your chosen control focused. File
searches reset when the observed folder changes. Escape clears a nonempty file
search first; pressing it again closes the computer details panel.
Selecting a file collects it as a deliverable. Ended computers retain their last
folder observation with navigation disabled.

**Preview** supports UTF-8 text, formatted JSON and bounded PNG images. HTML is
shown as literal text; previews do not run file scripts or load external content.
Long text previews are shortened with a notice; saving retains the complete file.
Previewing and saving pin the path, digest, byte count and media type to the
collected version shown in the chat. The desktop validates the exact downloaded
bytes again and refuses stale responses after the file, brand or engine changes.

**Save file** reports cancellation and errors beside the file and prevents duplicate
save dialogs. Native saves write and flush a private temporary file in the chosen
directory before replacing the destination; a failed replacement preserves the
previous destination and removes the temporary file. Browser previews use ordinary
downloads. Limits are four files, 128 KiB each, eight criteria, and 200 directory
entries. Directory traversal, symlinks, special files and sensitive root files
are refused. Arbitrary prose correctness and external business outcomes require
additional domain-specific criteria.

## Budgets and retention

Chat configuration sets server limits on dollars, cumulative model tokens,
actions and elapsed runtime. Hard ceilings are $20, one million tokens, 500
actions and 24 hours; defaults are $5, 100,000 tokens, 100 actions and one hour.
Sandbox inference reserves cost/tokens across concurrent calls before contacting
the provider, records observed usage, and conservatively retains unknown usage
reservations after interrupted calls. Visual inference requires provider token
counting. Recovery retains the session budget ledger. These limits bound agent
usage; they are not a fixed-price billing guarantee for infrastructure shutdown
latency or unmetered external MCP services.

The server status view retains up to 100 transcript entries and 300 timeline
events; large continuation checkpoints prune these caches further. The desktop
merges received windows by stable message/event IDs, retaining up to 1,000
messages (512 KB) and 1,000 timeline events (384 KB) per chat. The UI indicates
when retention limits or gaps leave older observations unavailable. Events that
occurred outside a received server window cannot be reconstructed by this cache.
Temporal retains command history according to its namespace policy.

Model context is bounded and old screenshots are omitted. Artifact bytes live in
workflow state, while the desktop persists metadata, configuration and retained
history. Screenshot pixels and duplicate server transcript/event arrays are
omitted from desktop persistence. Service histories and checkpoint retention
follow the backend deployment policies.

## Validation

`npm run test:computer-chat:harness` checks the live acceptance harness against
owned local failure fixtures. It covers lost start acknowledgements, malformed
workflow identities, delayed shutdown evidence and explicit cleanup failures.
It does not exercise real sandbox, workflow or policy services. The release
workflow runs this check before the unit coverage suite.

The Electron project includes a native chat recovery check:

```bash
npm run build:electron
npm run build:vite
npm run typecheck:e2e
node node_modules/@playwright/test/cli.js test --project=electron
```

Run these checks through the shared Agent Builds queue on the workstation. Linux
UI tests require a working display; CI uses `xvfb-run`. Each Electron launch uses
an isolated temporary profile set before the app opens its credential store.
Unexpected launch failures fail the tests. The native recovery check uses the
real preload, IPC, encrypted storage and main-process HTTP client with a local
workflow fixture. It checks separate workflow/computer identities, saved drafts,
restart reconciliation without action replay, and stable message IDs after an
ambiguous acknowledgement. This verifies desktop behavior, not live service execution.
The native suite also checks that a connection banner leaves the composer visible
at normal and smaller window sizes. Dark dashboard and light settings text contrast
are enforced, and scrollable MCP configuration blocks support keyboard navigation.

Focused desktop tests exercise persisted identities, lost acknowledgements,
conversation/brand isolation, exact rewrite consent, denial presentation, digest
checks and legacy behavior. Backend tests cover complete workflow replay,
pre-provision cancellation, action-bound reviews, bounded tool context, workspace
paths, proxy cancellation, checkpoint ownership and budget preservation. NSR
checks include tampered bytes, JSON mismatches, missing evidence and identity-bound
manifests.

Run the real-service reliability harness against an isolated test brand:

```bash
export CHAT_TEST_ENGINE_URL=https://your-test-engine.example
export CHAT_TEST_ENGINE_KEY=...      # do not put credentials in VITE_ variables
export CHAT_TEST_TENANT_ID=...       # UUID
export CHAT_TEST_BRAND_ID=...        # UUID
export CHAT_TEST_NSR_URL=https://your-test-nsr.example
export CHAT_TEST_NSR_KEY=...         # same sandbox organization
npm run test:computer-chat:live
```

The harness creates a real computer and uses provider inference (up to $2, 12
actions and ten minutes). It checks duplicate starts/messages, mismatched reviews,
worker progress without desktop polling, file creation, independent acceptance,
tamper rejection, organization isolation and confirmed shutdown. It requests
cleanup of its own workflow on success and caught failures. Missing configuration
or failed assertions exit
nonzero; the command never silently skips or substitutes mocks. An optional
`CHAT_TEST_MODEL` chooses a priced model. The manually triggered GitHub workflow
uses the `computer-chat-test` environment with these variables/secrets.

Tenant and brand settings must be UUIDs. The cleanup target is derived from the
brand and request ID before sending the start request; an unexpected returned
workflow ID cannot redirect cleanup. Failed runs attempt shutdown and wait up to
one minute for a matching request/brand receipt with confirmed cleanup. They emit
`cleanup_confirmed` and the owned workflow ID on stderr so an unconfirmed shutdown
can be inspected before rerunning. A cleanup confirmation does not turn a failed
acceptance run into a pass.

Live service execution still requires configured services and credentials. Unit
and replay tests do not substitute for deploying all three services or for a
worker process crash drill against the target infrastructure.
