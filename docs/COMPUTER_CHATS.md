# Computer chats

The desktop sends Sandbox API and NSR Decisions requests through its native
network transport. Hosted services do not need to accept browser preflight
requests from `localhost` or `file:` origins. The transport accepts only the
configured Sandbox/NSR endpoints and supported chat API paths, checks the
current saved key before dispatch, and refuses redirects. NSR requests also
carry the original chat's organization/brand vault scope. Existing action,
receipt and exact-byte verification gates still apply.

Requests have deadlines, response-size limits and per-window concurrency limits.
Cancellation belongs to the requesting app document; closing or replacing that
document cancels its outstanding requests. Pausing agent work still preserves
acknowledgements for already submitted mutations, so their computer identities
remain available for cleanup. Browser previews without the native bridge use
browser networking and still require the service's CORS support.

New chats use **Sandbox API** by default. Open **Chats → Settings**, save a
Sandbox API key, then choose **New Chat**. The chat is saved first; its dedicated
computer is created in the background through `POST /api/v1/agent/sessions` and
started through the session's `/start` endpoint. The desktop uses the
`computer-use` template with 2 CPUs, 4 GiB, gVisor and a one-hour session budget.
These sessions explicitly request `durable: false`, so they do not depend on the
hosted durable-sandbox feature flag or workflow-engine credentials.

The chat ID supplies a stable create idempotency key. The desktop persists the
returned session ID before starting its computer. **Retry computer setup** reuses
that session. After an unconfirmed startup request, **Check computer setup** only
reads the existing session until the outcome is known; it does not send another
start request. Reopening a saved chat only reads its current status. It never
replays an action or silently creates a replacement computer. Stop the computer
before deleting the saved chat; archiving retains the running computer.

Agent work runs while the desktop is open. The Sandbox API manages the computer
and its lifetime; closing the window does not imply that its compute has stopped.
Use **Stop computer** to end the session. The desktop confirms the session has
ended and every known sandbox is stopped or absent before marking cleanup complete.
Observed sandbox IDs survive terminal session responses and app restarts. An older
session with a missing computer identity requires inspection rather than an assumed cleanup.
If a completed session left a known computer running, the desktop retries that
computer's stop endpoint and still waits for stopped/absent status.
If cleanup is unconfirmed, use **Check shutdown**; further actions stay blocked. Runtime errors and provisioning failures
remain visible in the conversation, with the transcript and draft retained.

**Pause setup** and **Pause work** prevent the desktop from taking the next step.
During **Pausing…**, a submitted setup or execution request may still be running;
the desktop waits for its acknowledgement so it can retain the session identity
or execution result. Pausing does not stop the computer or cancel an already
submitted workflow. The saved **Paused** notice survives reopening; drafts remain
editable, and continuing requires an explicit send, setup retry or action recovery.
Use **Stop computer** once the current request settles to end the computer. Cleanup
has no pause control and still requires confirmed shutdown of the original session
and known computers. A shutdown response for a different session or organization
is rejected before any computer cleanup based on that response.

The desktop saves an unfinished-work marker with each submitted task before
inference begins. If the app exits before that work finishes, reopening shows
**Work interrupted**, includes the chat in **Needs attention**, and retains its
transcript and draft. Send an explicit follow-up to continue. Pending actions still
require their own recovery review first; opening a chat never resubmits its task
or actions. Successful completion and confirmed shutdown clear the marker.

The sandbox organization must supply inference credentials. NSR admission and
execution-policy checks are on by default and require an NSR API key saved in
Chat settings. [nsr.stateset.com](https://nsr.stateset.com) is the NSR console;
its API is `https://api.nsr.stateset.com` (override with `VITE_POLICY_API_URL`).
The desktop uses `POST /v1/decisions` with `X-API-Key`, `X-Org-ID` set to the
sandbox session's organization, and a unique idempotency key. It never sends the
Sandbox API key to NSR.

Chat settings includes a local setup checklist for computer access and the NSR
key saved for the selected organization and brand. A saved key does not establish
live authentication, model access, NSR policy readiness or workflow availability.
Saving keys does not allocate a computer or start an agent. A partial save names
which key succeeded and retains the failed entry for retry. Vault saves and
removals are serialized so concurrent changes cannot erase another brand's keys;
only confirmed writes report success. A workspace switch prevents an old setup
save from starting its next step or reporting errors into the new workspace.
When the system keyring is unavailable, both Sandbox and NSR keys last only until
the app quits; an unknown keyring capability is shown as unconfirmed.

Choose **Check Sandbox connection** to make an authenticated, read-only request
to `/api/v1/agent/sessions/capabilities`. The complete version-one response must
declare the computer image, inference configuration, workspace evidence and the
128 KiB file limit. Missing capability fields never count as successful readiness.
The check creates no computer, performs no inference and creates no NSR decision.
Model credit balances, actual execution, policy acceptance and Temporal remain
separate live checks. Results are discarded after a key, organization, brand or
unsaved-key change; rejected checks retain the saved credentials.

Conversation errors name the service that needs attention and show the next
useful action. Missing policy keys open connection settings; proof failures offer
file review without rerunning verification. Provider credit or authentication
failures do not suggest replacing the Sandbox key or retry tasks automatically.
Original messages are available under **Technical details**. Computer/session IDs
are under **Computer and permissions → Session details**.

File checks validate workspace paths, SHA-256 digests and the 16,384 JSON-encoded
byte expectation limit locally before making a status or evidence request. Invalid
entries remain editable, and exact-text checks can intentionally match an empty
file. Failed submissions retain the form for an explicit retry. Saved receipts
are labeled **Last recorded check**; editing a new expectation does not verify it
or change that historical receipt. NSR transport and response-contract failures
never count as accepted verification and do not trigger automatic decision replay.

Before a policy-enabled message is submitted, the desktop checks that an NSR key
is saved for the selected organization and brand. This is a local configuration
check, not an authorization or live connection test, and does not create a paid
decision. If the key is missing, the task stays in the composer and no model call
is made. Use **Connection settings** beside the error to finish setup.

Action checks hydrate your organization's stored NSR policy. The desktop sends
observations, not permission-granting rules. Configure rules proving
`can_execute(actor, call_hash)` for admission and
`can_accept_execution(actor, call_hash)` for post-execution checks. The actor is
`desktop-chat-<chat UUID>`. Observations include `requested_tool_call`,
`call_tool`, `call_resource` (computer ID), `call_session`, `call_nonce`,
`call_phase`, `call_workspace`, `call_command_sha256`, `call_executable`,
`call_argument_json(call_hash, zero_based_index_after_executable, JSON_encoded_value)`,
`call_gui_grounded`, and, after execution, `execution_exit_code` and
`execution_output_truncated`. These are desktop-supplied observations, not
attested sandbox facts. The call hash binds organization, session, computer,
exact action/argv, phase, observations and a fresh nonce. Argument values use
JSON string literals so a leading `?` cannot become an NSR logic variable; other
variable-valued observations are rejected before submission. Without a stored
permission rule the decision cannot authorize execution.

Only an explicitly live (`shadow: false`) approval routed to `act`, carrying a
proof bundle for the exact organization and authorization goal, can pass. The
bundle is replayed verbatim through `POST /v1/proofs/verify`; typed goal bindings
also require explicit verifier confirmation. Denials and refusals block work;
confirm/escalate routing requires attention. No automatic decision retry occurs
following an uncertain response. Saved admission receipts never bypass a fresh
check before a new dispatch; completed actions and existing workflows are reconciled
without repeating execution. Disabling checks is explicit in **Computer and
permissions**. Checks inspect permissions, exit status and truncation metadata;
they do not establish answer accuracy or a business outcome.

For a Sandbox API chat, open **Verify a file** under `/workspace`. Choose
**Contains text**, **Exact text** or **SHA-256 digest**, then select **Check file
with NSR**. The controller reads the file; the desktop validates the returned
size/digest and performs the deterministic comparison locally. Text checks
require valid UTF-8. The desktop then submits the comparison result and hashes
to Decisions with an explicit request-scoped rule proving
`desktop_file_check(session_id, binding)` only when the observation matched.
This file check does not hydrate organization policy or authorize computer work.
NSR verifies the proof over the desktop's observation; the Decisions API does
not independently read or recompute the file bytes. The agent never judges its
own output.

Checks are limited to one regular file of at most 128 KiB and a 16,384-byte
JSON-encoded expectation. The controller refuses symlinks, sensitive files and
paths outside the workspace. The binding covers organization, session, request,
path, file digest, criterion digest and comparison result. Wrong proof goals,
foreign organizations, invalid proofs and approvals of failed observations are
rejected. Checks share the chat operation lock; connection changes and
cancellation discard late responses. Further actions or a rotated computer mark
the receipt outdated. External changes require checking again.

File bytes and expected values stay in the desktop and are not saved in the
chat or sent to NSR. Only hashes and the comparison result reach Decisions.
Receipts retain the decision ID, identities, digest, check kind and time.
Expected text is not restored when reopening the chat. These hashes are
integrity identifiers, not encryption of low-entropy content.

When an action is pending, the **Action recovery** panel below the composer
explains the saved state. **Verify saved result** reviews an existing execution
receipt without running its command again; **Check workflow** reads the existing
workflow. **Recover action** handles an unconfirmed outcome using its original
request: it can execute the original action if that action was never executed.
Expand **Action details** to inspect the request, original computer and bounded
command preview. **Saved output** shows bounded plain-text observations labeled
unverified; it does not restore screenshot pixels or imply acceptance.

A changed, unavailable or unbound computer does not offer execution recovery.
**Check computer status** only reads the saved session; it cannot allocate or
start a computer. Recovery itself also uses this read-only path before checking
the original action identity. Pending actions appear in the **Needs attention**
filter even when there is no error message.

Pending actions record their original organization, session and computer before
dispatch. Recovery cannot run an uncertain action on a replacement computer or
verify an earlier result against the replacement's identity. Completed execution
receipts remain pending when identity checks fail; recovery never repeats a
completed action. Existing workflows can be inspected without starting them
again, but their results still require the original identity before acceptance.
Older pending actions without a recorded computer binding remain readable for
inspection and cannot be replayed. Stop the computer and start a new chat to
continue; the saved transcript remains available. A status or startup response
with a different session or organization is rejected without replacing the saved
identity.

Follow-up turns retain bounded, untrusted tool observations while the app is open.
Raw tool results and screenshot pixels are excluded from saved transcripts; after
reopening, the agent is told that earlier observations are unavailable and must
inspect the computer again. Each new turn requires a fresh screenshot before GUI
actions. Inference has a two-minute desktop deadline and can also be paused.

Choose **Durable workflow** in **New chat runtime** to create an engine-owned
computer instead. That mode retains its seven required connection checks,
organization bindings, server-side budgets, recovery and approval behavior.
Existing engine-owned chats continue to use their original runtime.

## Durable workflow chats

When **New chat runtime** is **Durable workflow**, each new chat creates a `ComputerChatWorkflow` in `next-temporal-rs` and a
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

Sandbox chat drafts stay editable while a computer is preparing, agent work is
running or a pending action needs review. A short composer hint explains when
sending is blocked. Enter and the send button cannot submit during these states;
becoming ready never sends a draft automatically. A submitted message is retained
before its matching draft is cleared, and edits made during that save remain
available as a separate draft. Stopped computers and unconfirmed shutdown keep
their retained drafts read-only.

Model and NSR preferences belong to each Sandbox chat. Edit them under
**Computer and permissions**, then select **Save preferences**. New work stays
blocked until changes are valid and the save is acknowledged; failed saves keep
your entries for retry and retain the previously applied settings. Preferences
restore when reopening the same chat, while new chats start with policy checks
enabled. A policy-off notice remains visible in the conversation header even
when details are collapsed. Pending actions keep their original policy choice;
preferences cannot change during active work or pending-action review. Model
names must be nonblank and fit within 255 UTF-8 bytes. Validation happens before
computer access, model inference or clearing the submitted draft.

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

Both Sandbox API and durable chat transcripts initially render the latest 100 messages. **Show older messages**
loads earlier cached entries. Reading earlier messages stops automatic scrolling;
**Jump to latest** returns to live updates. New messages are counted while you read
earlier history, without moving your position or keyboard focus. Empty Sandbox
chats distinguish active preparation, interrupted setup and ended computers;
viewing saved history never starts a computer or replays an action.

Conversation status is consistent in the chat header, library and command search.
Sandbox chats show live setup, agent work, recovery, screenshots, file checks and
shutdown in all three places. A pending pause appears as **Pausing…** until the
current request is reconciled. When work finishes, the saved pause, pending-action
review or computer state is shown again. These activity labels are temporary;
opening a saved conversation does not resume or replay its work.
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

Check a configured test stack without creating a workflow or spending inference
budget:

```bash
npm run doctor:computer-chat -- --env-file /path/to/approved-local-test.env
```

Use the six `CHAT_TEST_*` variables shown below. An explicit environment file is
parsed as data, never executed, and supplies the complete test configuration;
shell credentials are not mixed into it. Without `--env-file`, the command uses
the current environment. Output is JSON, omits configuration values and service
error bodies, and exits nonzero when configuration or readiness is incomplete.
It checks the engine's control-plane database and Temporal namespace, all seven
required computer capability checks, and direct policy capability access. It
rejects redirects, duplicated or incomplete readiness evidence, and oversized
responses. The desktop also requires all seven capability checks before accepting
a ready report.

`ready_for_live_test` means those declared prerequisites passed. It does not prove
that a worker consumed a task, a model generated output, a sandbox executed an
action, or NSR verified the result. Only the live harness below establishes those
execution outcomes. A local Docker sandbox created by `sandboxctl --backend docker`
does not provide the controller's durable agent-session APIs and cannot substitute
for the engine's sandbox connector. Source directories alone do not start services.

`npm run test:computer-chat:harness` checks the live acceptance harness against
owned local failure fixtures. It covers lost start acknowledgements, malformed
workflow identities, delayed shutdown evidence and explicit cleanup failures.
It also checks the read-only preflight against owned local HTTP fixtures, including
Temporal failures, missing capability evidence and credential-safe errors.
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
