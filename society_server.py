"""
Society of Brains — Extended API Server
=========================================
Extends the original web_server.py with full profile/bot/conversation
management. Profiles are environments containing named bots (personas).
Memory is isolated per profile. THE ULTIMATE aggregates across all.
"""

import os
import sys
import json
import uuid
import time
import logging
import threading
from pathlib import Path
from flask import Flask, request, jsonify, send_from_directory, Response
from flask_cors import CORS

# ── bootstrap ──────────────────────────────────────────────────────────────
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from brain_swarm_system import BrainSwarmOrchestrator

logging.basicConfig(level=logging.INFO,
                    format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

app = Flask(__name__, static_folder='static', static_url_path='')
CORS(app, resources={r"/api/*": {"origins": "*"}})

# ── orchestrator (one shared instance – thread-safe via lock) ──────────────
REGIONS_PATH = os.path.dirname(os.path.abspath(__file__))
logger.info("Initialising BrainSwarmOrchestrator …")
orchestrator = BrainSwarmOrchestrator(REGIONS_PATH, use_mock_server=False)
logger.info("Orchestrator ready.")
_orch_lock = threading.Lock()

# ── in-memory stores ───────────────────────────────────────────────────────
# profiles: {id: {id, name, description, color, bots: [{id,name,persona}], conversations: [...]}}
_store_lock = threading.Lock()
PROFILES: dict = {}
CONVERSATIONS: dict = {}          # conv_id → conv object
STREAMS: dict = {}                # conv_id → list[queue]
ULTIMATE_MEMORY: list = []        # [{profile, bot, turn, text}]

# Pre-seed THE ULTIMATE (fixed id)
ULTIMATE_ID = "ultimate"

def _get_or_create_ultimate():
    if ULTIMATE_ID not in PROFILES:
        PROFILES[ULTIMATE_ID] = {
            "id": ULTIMATE_ID,
            "name": "THE ULTIMATE",
            "description": "Aggregates personalities and memory from every profile.",
            "color": "#d4a847",
            "is_ultimate": True,
            "bots": [],
            "conversations": []
        }
    return PROFILES[ULTIMATE_ID]

with _store_lock:
    _get_or_create_ultimate()

# ── helpers ────────────────────────────────────────────────────────────────

def _push_event(conv_id: str, data: dict):
    """Push a JSON event to all SSE listeners for a conversation."""
    if conv_id in STREAMS:
        for q in STREAMS[conv_id]:
            q.append(data)


def _bot_color(idx: int) -> str:
    palette = [
        "#3b82f6", "#10b981", "#f59e0b", "#8b5cf6",
        "#ec4899", "#06b6d4", "#14b8a6", "#f43f5e",
        "#84cc16", "#a78bfa"
    ]
    return palette[idx % len(palette)]

# ── profile routes ─────────────────────────────────────────────────────────

@app.route("/api/profiles", methods=["GET"])
def list_profiles():
    with _store_lock:
        profiles = list(PROFILES.values())
    return jsonify(profiles)


@app.route("/api/profiles", methods=["POST"])
def create_profile():
    data = request.json or {}
    name = (data.get("name") or "").strip()
    description = (data.get("description") or "").strip()
    first_bot_name = (data.get("bot_name") or "").strip()
    first_bot_persona = (data.get("bot_persona") or "").strip()

    if not name:
        return jsonify({"error": "Profile name is required"}), 400
    if not first_bot_name:
        return jsonify({"error": "At least one bot is required when creating a profile"}), 400
    if not first_bot_persona:
        return jsonify({"error": "Bot persona is required"}), 400

    pid = f"prof-{uuid.uuid4().hex[:8]}"
    bid = f"bot-{uuid.uuid4().hex[:8]}"

    # Count existing profiles to pick color offset
    with _store_lock:
        color_idx = len([p for p in PROFILES.values() if not p.get("is_ultimate")])
    
    bot = {
        "id": bid,
        "name": first_bot_name,
        "persona": first_bot_persona,
        "color": _bot_color(color_idx),
        "profile_id": pid
    }
    profile = {
        "id": pid,
        "name": name,
        "description": description,
        "color": _bot_color(color_idx),
        "is_ultimate": False,
        "bots": [bot],
        "conversations": []
    }

    with _store_lock:
        PROFILES[pid] = profile
        # Also register bots in THE ULTIMATE
        _get_or_create_ultimate()["bots"].append({**bot, "profile_id": pid, "profile_name": name})

    logger.info(f"Created profile '{name}' (id={pid}) with bot '{first_bot_name}'")
    return jsonify(profile), 201


@app.route("/api/profiles/<pid>", methods=["GET"])
def get_profile(pid):
    if pid == ULTIMATE_ID:
        with _store_lock:
            return jsonify(_get_or_create_ultimate())
    with _store_lock:
        profile = PROFILES.get(pid)
    if not profile:
        return jsonify({"error": "Profile not found"}), 404
    return jsonify(profile)


@app.route("/api/profiles/<pid>", methods=["PATCH"])
def update_profile(pid):
    with _store_lock:
        profile = PROFILES.get(pid)
    if not profile:
        return jsonify({"error": "Profile not found"}), 404
    data = request.json or {}
    if "name" in data:
        profile["name"] = data["name"].strip()
    if "description" in data:
        profile["description"] = data["description"].strip()
    return jsonify(profile)


@app.route("/api/profiles/<pid>", methods=["DELETE"])
def delete_profile(pid):
    if pid == ULTIMATE_ID:
        return jsonify({"error": "Cannot delete THE ULTIMATE"}), 400
    with _store_lock:
        profile = PROFILES.pop(pid, None)
        if not profile:
            return jsonify({"error": "Profile not found"}), 404
        # Remove all bots belonging to this profile from THE ULTIMATE
        ult = _get_or_create_ultimate()
        ult["bots"] = [b for b in ult["bots"] if b.get("profile_id") != pid]
        # Clean up conversations
        for cid in list(CONVERSATIONS.keys()):
            if CONVERSATIONS[cid].get("profile_id") == pid:
                CONVERSATIONS.pop(cid, None)
    logger.info(f"Deleted profile '{profile.get('name')}' (id={pid})")
    return jsonify({"ok": True})



# ── bot routes ─────────────────────────────────────────────────────────────

@app.route("/api/profiles/<pid>/bots", methods=["POST"])
def add_bot(pid):
    with _store_lock:
        profile = PROFILES.get(pid)
    if not profile:
        return jsonify({"error": "Profile not found"}), 404
    if profile.get("is_ultimate"):
        return jsonify({"error": "Cannot add bots directly to THE ULTIMATE"}), 400

    data = request.json or {}
    bot_name = (data.get("name") or "").strip()
    bot_persona = (data.get("persona") or "").strip()
    if not bot_name or not bot_persona:
        return jsonify({"error": "Bot name and persona are required"}), 400

    with _store_lock:
        idx = len(profile["bots"]) + len([p for p in PROFILES.values() if not p.get("is_ultimate")])
    
    bid = f"bot-{uuid.uuid4().hex[:8]}"
    bot = {
        "id": bid,
        "name": bot_name,
        "persona": bot_persona,
        "color": _bot_color(idx),
        "profile_id": pid
    }

    with _store_lock:
        profile["bots"].append(bot)
        _get_or_create_ultimate()["bots"].append({**bot, "profile_id": pid, "profile_name": profile["name"]})

    logger.info(f"Added bot '{bot_name}' to profile '{profile['name']}'")
    return jsonify(bot), 201


@app.route("/api/profiles/<pid>/bots/<bid>", methods=["DELETE"])
def remove_bot(pid, bid):
    with _store_lock:
        profile = PROFILES.get(pid)
    if not profile:
        return jsonify({"error": "Profile not found"}), 404

    with _store_lock:
        profile["bots"] = [b for b in profile["bots"] if b["id"] != bid]
        ult = _get_or_create_ultimate()
        ult["bots"] = [b for b in ult["bots"] if b["id"] != bid]

    return jsonify({"ok": True})


# ── conversation routes ────────────────────────────────────────────────────

@app.route("/api/profiles/<pid>/conversations", methods=["GET"])
def list_conversations(pid):
    with _store_lock:
        profile = PROFILES.get(pid) if pid != ULTIMATE_ID else _get_or_create_ultimate()
    if not profile:
        return jsonify({"error": "Profile not found"}), 404
    return jsonify(profile.get("conversations", []))


@app.route("/api/profiles/<pid>/conversations", methods=["POST"])
def start_conversation(pid):
    with _store_lock:
        profile = PROFILES.get(pid) if pid != ULTIMATE_ID else _get_or_create_ultimate()
    if not profile:
        return jsonify({"error": "Profile not found"}), 404

    data = request.json or {}
    query = (data.get("query") or "").strip()
    max_level = int(data.get("max_level", 3))
    bot_ids = data.get("bot_ids", [b["id"] for b in profile["bots"]])

    if not query:
        return jsonify({"error": "Query is required"}), 400

    active_bots = [b for b in profile["bots"] if b["id"] in bot_ids]
    if not active_bots:
        return jsonify({"error": "No active bots found for this profile"}), 400

    conv_id = f"conv-{uuid.uuid4().hex[:8]}"
    conv = {
        "id": conv_id,
        "profile_id": pid,
        "query": query,
        "max_level": max(2, min(5, max_level)),
        "status": "running",
        "turns": [],
        "active_bots": active_bots,
        "created_at": time.time()
    }

    with _store_lock:
        CONVERSATIONS[conv_id] = conv
        STREAMS[conv_id] = []
        profile.setdefault("conversations", []).append({
            "id": conv_id,
            "query": query,
            "status": "running",
            "created_at": conv["created_at"]
        })

    # Run query in background thread
    t = threading.Thread(target=_run_swarm, args=(conv_id, query, active_bots, max_level), daemon=True)
    t.start()

    return jsonify(conv), 201


@app.route("/api/conversations/<conv_id>", methods=["GET"])
def get_conversation(conv_id):
    with _store_lock:
        conv = CONVERSATIONS.get(conv_id)
    if not conv:
        return jsonify({"error": "Conversation not found"}), 404
    return jsonify(conv)


@app.route("/api/conversations/<conv_id>/stop", methods=["POST"])
def stop_conversation(conv_id):
    with _store_lock:
        conv = CONVERSATIONS.get(conv_id)
    if conv:
        conv["status"] = "stopped"
    return jsonify({"ok": True})


@app.route("/api/conversations/<conv_id>/stream", methods=["GET"])
def stream_conversation(conv_id):
    if conv_id not in CONVERSATIONS:
        return "Not found", 404

    def generator():
        q = []
        with _store_lock:
            STREAMS.setdefault(conv_id, []).append(q)
        try:
            while True:
                if q:
                    evt = q.pop(0)
                    yield f"data: {json.dumps(evt)}\n\n"
                    if evt.get("event") in ("complete", "error"):
                        break
                else:
                    conv = CONVERSATIONS.get(conv_id, {})
                    if conv.get("status") in ("done", "stopped", "error") and not q:
                        break
                    time.sleep(0.15)
        finally:
            with _store_lock:
                if conv_id in STREAMS and q in STREAMS[conv_id]:
                    STREAMS[conv_id].remove(q)

    return Response(generator(), mimetype="text/event-stream",
                    headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


# ── THE ULTIMATE memory ────────────────────────────────────────────────────

@app.route("/api/ultimate/memory", methods=["GET"])
def get_ultimate_memory():
    return jsonify(ULTIMATE_MEMORY)


# ── original query endpoint (kept for compatibility) ───────────────────────

@app.route("/api/query", methods=["POST"])
def api_query():
    try:
        data = request.json or {}
        query = (data.get("query") or "").strip()
        stream = data.get("stream", False)
        max_level = max(2, min(5, int(data.get("max_level", 3))))
        if not query:
            return jsonify({"error": "Query required"}), 400
        if stream:
            def gen():
                with _orch_lock:
                    for chunk in orchestrator.process_query_stream(query, max_level=max_level):
                        yield chunk
            return Response(gen(), mimetype="application/x-ndjson")
        else:
            with _orch_lock:
                result = orchestrator.process_query(query, max_level=max_level)
            return jsonify(result)
    except Exception as e:
        logger.error(f"Error: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500


# ── static fallback ────────────────────────────────────────────────────────

@app.route("/", defaults={"path": ""})
@app.route("/<path:path>")
def serve_static(path):
    static_dir = app.static_folder
    if path and os.path.exists(os.path.join(static_dir, path)):
        return send_from_directory(static_dir, path)
    return send_from_directory(static_dir, "index.html")


# ── background swarm runner ────────────────────────────────────────────────

def _inject_persona_context(query: str, bots: list) -> str:
    """Prepend persona context to the query so the LLM reasons through each bot's lens."""
    if not bots:
        return query
    personas = "\n".join(
        f"- {b['name']}: {b['persona']}"
        for b in bots
    )
    return (
        f"You are facilitating a discussion between the following personalities:\n"
        f"{personas}\n\n"
        f"Scenario / Query: {query}"
    )


def _run_swarm(conv_id: str, query: str, bots: list, max_level: int):
    conv = CONVERSATIONS.get(conv_id)
    if not conv:
        return

    enriched_query = _inject_persona_context(query, bots)
    logger.info(f"[{conv_id}] Starting swarm | bots={[b['name'] for b in bots]}")

    try:
        for raw_line in orchestrator.process_query_stream(enriched_query, max_level=max_level):
            if conv.get("status") == "stopped":
                _push_event(conv_id, {"event": "complete", "status": "stopped"})
                return

            try:
                evt = json.loads(raw_line.strip())
            except Exception:
                continue

            # Annotate agent_speech events with the matching bot persona
            if evt.get("event") == "agent_speech":
                region = evt.get("region", "")
                # Try to match a bot by name similarity
                matched_bot = None
                for b in bots:
                    if b["name"].lower() in region.lower() or region.lower() in b["name"].lower():
                        matched_bot = b
                        break
                if matched_bot:
                    evt["bot_name"] = matched_bot["name"]
                    evt["bot_color"] = matched_bot["color"]
                    evt["bot_id"] = matched_bot["id"]

                # Save to turn history
                turn = {
                    "region": region,
                    "round": evt.get("round"),
                    "text": evt.get("text", ""),
                    "bot_name": evt.get("bot_name"),
                    "bot_color": evt.get("bot_color"),
                    "bot_id": evt.get("bot_id")
                }
                with _store_lock:
                    conv["turns"].append(turn)
                    # Store in ULTIMATE memory too
                    ULTIMATE_MEMORY.append({
                        "conv_id": conv_id,
                        "profile_id": conv.get("profile_id"),
                        **turn
                    })

            _push_event(conv_id, evt)

        # Mark done
        with _store_lock:
            conv["status"] = "done"
            pid = conv.get("profile_id")
            if pid and pid in PROFILES:
                for c in PROFILES[pid].get("conversations", []):
                    if c["id"] == conv_id:
                        c["status"] = "done"
                        break
            elif pid == ULTIMATE_ID:
                ult = _get_or_create_ultimate()
                for c in ult.get("conversations", []):
                    if c["id"] == conv_id:
                        c["status"] = "done"
                        break

        _push_event(conv_id, {"event": "complete", "status": "done"})

    except Exception as e:
        logger.error(f"[{conv_id}] Swarm error: {e}", exc_info=True)
        with _store_lock:
            conv["status"] = "error"
        _push_event(conv_id, {"event": "error", "message": str(e)})


# ── main ───────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    PORT = int(os.environ.get("PORT", 8055))
    logger.info(f"Society of Brains API running on http://0.0.0.0:{PORT}")
    app.run(host="0.0.0.0", port=PORT, debug=False, threaded=True)
