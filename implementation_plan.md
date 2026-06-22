# Implementation Plan - Real-time Query Streaming & UI Responsiveness

We will update the system to clear the prompt input bar immediately when a query is submitted, show the user's query instantly in the chat thread, and stream the orchestrator pipeline steps to the user interface in real-time as they process, rather than waiting for the entire backend task to finish.

## User Review Required

> [!IMPORTANT]
> - **Real-time Streaming Protocol**: We will implement Line-Delimited JSON (NDJSON) streaming over the existing POST `/api/query` endpoint by adding a `stream: true` flag. This ensures backwards compatibility with any non-streaming API clients.
> - **Immediate UX Feedback**: When the user presses Enter or clicks Send:
>   - The input textarea will be cleared immediately.
>   - The query will be inserted into the chat thread immediately.
>   - The input textarea will be disabled during processing, and re-enabled upon pipeline completion or error.
> - **Parallel Thinking Animation**: In the rounds phase, all active region agents will display their "Reasoning..." loading animations simultaneously, and then update to their final speech bubble as their respective LLM responses finish processing.

---

## Proposed Changes

### 1. Swarm Core

#### [MODIFY] [brain_swarm_system.py](file:///c:/Users/keshp/OneDrive/Desktop/brain_regions/brain_swarm_system.py)
- Implement `process_query_stream(self, query: str)` which yields JSON-encoded event strings (NDJSON format, one JSON object per line) at each milestone of the 8-step pipeline.
- In the interaction rounds, run the region LLM tasks in a `ThreadPoolExecutor` and yield each agent's speech event as soon as its future completes.

### 2. Flask Backend

#### [MODIFY] [web_server.py](file:///c:/Users/keshp/OneDrive/Desktop/brain_regions/web_server.py)
- Modify `/api/query` to check for `stream: true` in the JSON payload.
- If streaming is requested, return a `Response` with generator-based chunked transfer-encoding using `mimetype='application/x-ndjson'`.

### 3. Frontend Controller

#### [MODIFY] [static/index.js](file:///c:/Users/keshp/OneDrive/Desktop/brain_regions/static/index.js)
- Update `submitQuery()`:
  - Clear the input textarea immediately.
  - Call `addUserBubble(query)` immediately.
  - Send the fetch request with `stream: true` to `/api/query`.
  - Read from `response.body` via a `ReadableStreamReader` and parse events line-by-line.
  - Dispatch actions dynamically based on events (`eval_start`, `vote_start`, `active_end`, `round_start`, `agent_speech`, `consensus_end`, `narrative_end`, etc.).
  - Ensure clean termination in `complete` event or `catch` block by restoring button/textarea states.

---

## Verification Plan

### Automated Tests
- Run `python test_runner.py` to verify the synchronous pipeline functionality remains completely intact and undisturbed.

### Manual Verification
- Start `web_server.py` and open `http://localhost:5000`.
- Submit a query and verify:
  1. The input bar clears immediately.
  2. The query is posted in the chat log immediately.
  3. The status indicator and pipeline dots switch states live as the backend works.
  4. In rounds phase, all involved agents show "Reasoning..." dots in parallel and update to speech bubbles as soon as they complete.
  5. The consensus and narrative blocks appear immediately upon generation.
