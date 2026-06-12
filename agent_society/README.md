# Brain Region Society

A brain-region twist on the *AI Agent Society* format: a stylized pixel office
where the "employees" are **brain-region agents**. You type a scenario (e.g.
*"You see a lion and feel afraid"*), the regions walk to the meeting room and
debate across five sequential stages, then vote and converge on which regions
form the **active network** and what the brain is doing.

This keeps the original's core idea (pixel office, sprite movement, live SSE
meeting loop, memory + relationships, human-moderator interjections) but:

- The roster is the **13 brain regions** of this repo's knowledge base — each
  agent's identity is loaded from its authored `*_agent_prompt.md` + `*_summary.md`.
- Every agent runs on **one shared LLM** (Llama-3.3-70B-Instruct at the lab's
  OpenAI-compatible endpoint) instead of six different providers.
- The office layout seats **N agents** programmatically (a ring around the
  meeting table), so it scales with the roster.

## The five meeting stages

1. **Initial Opinions** — each region states whether/how it's involved + confidence.
2. **Critique** — regions name the others they actually connect with, and challenge claims.
3. **Refinement** — regions update their stated role given the discussion.
4. **Voting** — structured for/against/abstain on being in the active network.
5. **Consensus** — a neutral facilitator synthesizes the active network + final interpretation.

## Run it

**Windows:** double-click `start_society.bat` (first run installs deps, then
opens http://localhost:3000).

**Manual:**

```bash
# backend
cd backend
python -m venv .venv
.venv/Scripts/pip install -r requirements.txt   # (.venv/bin/pip on macOS/Linux)
.venv/Scripts/python -m uvicorn app.main:app --port 8000

# frontend (separate terminal)
cd frontend
npm install
npm run dev          # http://localhost:3000
```

## Configuration

No API key is needed — the endpoint uses an empty key. Override defaults via
`.env` (see `.env.example`):

- `LLM_BASE_URL` — OpenAI-compatible endpoint (default `http://dgx5.humanbrain.in:8999/v1`)
- `LLM_MODEL` — model id (default `Llama-3.3-70B-Instruct`)
- `BRAIN_REGION_ROOT` — repo root holding the region folders (defaults to the parent of this folder)

Switching the model/endpoint for the whole society is a one-line change in
`backend/app/models.py` (or via the env vars above).

## Notes

- A full meeting is 13 regions × 5 stages, run sequentially, so it takes a few
  minutes per meeting on a single endpoint. The meeting pauses between stages so
  you can read along and optionally interject as a human moderator.
- Tooling / Observer-context features from the original are inherited but
  off by default; the LLM endpoint has no tool-calling, so meetings run text-only.

*Adapted from the AI Agent Society format by Nagarjun-Sivathanu.*
