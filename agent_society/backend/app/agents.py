"""
Agent roster — the brain regions.

This is the brain-region edition of AI Agent Society. Instead of six office
personas, the "society" is a network of brain-region agents. Each agent's
identity is loaded from the authored knowledge base in the parent repo
(<region>/<prefix>_agent_prompt.md + _summary.md), so a region speaks from its
real neuroanatomy. Every agent runs on the same shared LLM (see models.py).
"""
import os
from pathlib import Path

# Repo root that holds the region folders (Brain/, telencephalon/, …).
# agents.py → app → backend → agent_society → <repo root>
_DEFAULT_ROOT = Path(__file__).resolve().parents[3]
REGION_ROOT = Path(os.getenv("BRAIN_REGION_ROOT", str(_DEFAULT_ROOT)))

# Every agent uses the same model string; models.py ignores it and routes to
# the configured endpoint. Kept in the schema for UI display.
LLM_LABEL = os.getenv("LLM_MODEL", "Llama-3.3-70B-Instruct")

from app import brain_ontology as _onto  # noqa: E402


def _discover_folders() -> dict:
    """Scan the repo root for region folders (any dir with a *_summary.md) and
    map region id -> (folder_name, file_prefix). This is the auto-discovery: drop
    in a region folder and it becomes an agent — no hardcoded list."""
    found: dict[str, tuple[str, str]] = {}
    if not REGION_ROOT.exists():
        return found
    for entry in REGION_ROOT.iterdir():
        if not entry.is_dir():
            continue
        try:
            summaries = [f.name for f in entry.iterdir() if f.name.endswith("_summary.md")]
        except OSError:
            continue
        if not summaries:
            continue
        prefix = summaries[0][: -len("_summary.md")]
        found[entry.name.lower()] = (entry.name, prefix)  # folder "Brain" -> id "brain"
    return found


# id → (folder, file_prefix), discovered from disk.
REGION_FILES = _discover_folders()


def _load_region_text(agent_id: str) -> dict:
    """Read the authored agent_prompt + summary for a region (best-effort)."""
    folder, prefix = REGION_FILES.get(agent_id, (None, None))
    if not folder:
        return {"agent_prompt": "", "summary": ""}
    base = REGION_ROOT / folder
    prompt_path = base / f"{prefix}_agent_prompt.md"
    summary_path = base / f"{prefix}_summary.md"
    agent_prompt = prompt_path.read_text(encoding="utf-8") if prompt_path.exists() else ""
    summary = summary_path.read_text(encoding="utf-8") if summary_path.exists() else ""
    return {"agent_prompt": agent_prompt, "summary": summary}


# Curated metadata (role/emoji/colour/temperature/keywords) for the original
# high-level regions; every other discovered region is auto-styled.
_CURATED_LIST = [
    {
        "id": "brain",
        "name": "Brain",
        "role": "Whole-Brain Coordinator",
        "emoji": "🧠", "color": "#e5e7eb", "temperature": 0.4,
        "personality_traits": ["integrative", "routing", "global"],
        "expertise": ["dispatch", "global state", "arousal", "goal arbitration"],
    },
    {
        "id": "prosencephalon",
        "name": "Prosencephalon",
        "role": "Forebrain — Higher Cognition",
        "emoji": "🎓", "color": "#5b8cff", "temperature": 0.5,
        "personality_traits": ["cognitive", "deliberate", "executive"],
        "expertise": ["perception", "cognition", "language", "memory", "emotion"],
    },
    {
        "id": "midbrain",
        "name": "Midbrain",
        "role": "Mesencephalon — Reflex & Reward Relay",
        "emoji": "🎯", "color": "#ffb454", "temperature": 0.5,
        "personality_traits": ["fast", "reflexive", "orienting"],
        "expertise": ["visual/auditory reflexes", "reward", "eye movement", "motor tone"],
    },
    {
        "id": "rhombencephalon",
        "name": "Rhombencephalon",
        "role": "Hindbrain — Vital Automation",
        "emoji": "🫀", "color": "#38d39f", "temperature": 0.3,
        "personality_traits": ["automatic", "protective", "high-priority"],
        "expertise": ["breathing", "heartbeat", "balance", "protective reflexes"],
    },
    {
        "id": "diencephalon",
        "name": "Diencephalon",
        "role": "Relay & Homeostasis Hub",
        "emoji": "🌡️", "color": "#a78bfa", "temperature": 0.4,
        "personality_traits": ["relaying", "regulatory", "gatekeeping"],
        "expertise": ["thalamic relay", "homeostasis", "endocrine", "circadian rhythm"],
    },
    {
        "id": "telencephalon",
        "name": "Telencephalon",
        "role": "Cerebrum — Cognition & Voluntary Action",
        "emoji": "🧩", "color": "#6366f1", "temperature": 0.55,
        "personality_traits": ["conscious", "deliberative", "expressive"],
        "expertise": ["cortex", "voluntary movement", "language", "declarative memory", "emotion"],
    },
    {
        "id": "metencephalon",
        "name": "Metencephalon",
        "role": "Pons + Cerebellum — Motor Refinement",
        "emoji": "⚙️", "color": "#22d3ee", "temperature": 0.4,
        "personality_traits": ["precise", "corrective", "timing-focused"],
        "expertise": ["motor coordination", "balance", "motor learning", "timing"],
    },
    {
        "id": "medulla_oblongata",
        "name": "Medulla Oblongata",
        "role": "Cardiorespiratory Kernel",
        "emoji": "🫁", "color": "#34d399", "temperature": 0.3,
        "personality_traits": ["vital", "always-on", "non-negotiable"],
        "expertise": ["heart rate", "blood pressure", "respiratory rhythm", "swallowing/cough reflex"],
    },
    {
        "id": "fourth_ventricle",
        "name": "Fourth Ventricle",
        "role": "CSF / Hydraulic Support",
        "emoji": "💧", "color": "#38bdf8", "temperature": 0.35,
        "personality_traits": ["supportive", "background", "buffering"],
        "expertise": ["CSF production", "intracranial pressure", "metabolic clearance"],
    },
    {
        "id": "part_of_midbrain",
        "name": "Part of Midbrain",
        "role": "Midline Reflex & Reward",
        "emoji": "✨", "color": "#f59e0b", "temperature": 0.45,
        "personality_traits": ["orienting", "arousing", "reward-coding"],
        "expertise": ["colliculi reflexes", "dopamine/reward", "arousal", "motor tone"],
    },
    {
        "id": "right_side_of_midbrain",
        "name": "Right Side of Midbrain",
        "role": "Right Motor-Sensory Processing",
        "emoji": "➡️", "color": "#fb923c", "temperature": 0.4,
        "personality_traits": ["lateralised", "right-sided", "relaying"],
        "expertise": ["right eye movement", "right motor tone", "right sensory relay"],
    },
    {
        "id": "left_side_of_midbrain",
        "name": "Left Side of Midbrain",
        "role": "Left Motor-Sensory Processing",
        "emoji": "⬅️", "color": "#fbbf24", "temperature": 0.4,
        "personality_traits": ["lateralised", "left-sided", "relaying"],
        "expertise": ["left eye movement", "left motor tone", "left sensory relay"],
    },
    {
        "id": "aqueduct",
        "name": "Aqueduct",
        "role": "CSF Conductor",
        "emoji": "🔵", "color": "#60a5fa", "temperature": 0.35,
        "personality_traits": ["conducting", "narrow", "pressure-balancing"],
        "expertise": ["CSF flow 3rd→4th ventricle", "pressure homeostasis"],
    },
]

# ── Build the full roster from discovered folders + the ontology ────────────
_CURATED = {a["id"]: a for a in _CURATED_LIST}
# Keep the SHALLOWEST occurrence (some names repeat as their own child in the
# ontology, e.g. neurohypophysis / insula / lateral ventricle).
_NODE_BY_ID: dict = {}
for _n in _onto.all_regions():
    _NODE_BY_ID.setdefault(_n["id"], _n)
_DIV_COLOR = {"prosencephalon": "#6366f1", "midbrain": "#f59e0b",
              "rhombencephalon": "#10b981", "brain": "#e5e7eb"}
_AUTO_EMOJI = ["🧠", "🔮", "⚡", "🧩", "🌀", "✨", "🔷", "🟣", "🟢", "🟡",
               "🔵", "🟠", "🫧", "🧬", "🎯", "🩻", "🔶", "💠"]
_SMALL = {"of", "the", "and", "in", "to", "a"}


def _title(s: str) -> str:
    return " ".join(w if w in _SMALL else w[:1].upper() + w[1:] for w in s.split())


def _hash(s: str) -> int:
    h = 0
    for c in s:
        h = (h * 31 + ord(c)) & 0xFFFFFFFF
    return h


def _root_division(rid: str):
    cur = rid
    for _ in range(12):
        n = _NODE_BY_ID.get(cur)
        if not n:
            return None
        if n["level"] == 2:
            return n["id"]
        if n["level"] <= 1:
            return "brain"
        cur = n["parent_id"]
    return None


def _build_agents() -> list[dict]:
    defs = []
    for rid, (_folder, prefix) in sorted(REGION_FILES.items()):
        node = _NODE_BY_ID.get(rid)
        level = node["level"] if node else _onto.level_of(rid)
        parent = node["parent_id"] if node else None
        cur = _CURATED.get(rid, {})
        defs.append({
            "id": rid,
            "name": cur.get("name") or _title(node["name"] if node else prefix.replace("_", " ")),
            "role": cur.get("role") or (f"{_title(_onto.display_name(parent))} sub-region" if parent else "Brain region"),
            "emoji": cur.get("emoji") or _AUTO_EMOJI[_hash(rid) % len(_AUTO_EMOJI)],
            "color": cur.get("color") or _DIV_COLOR.get(_root_division(rid), "#9ca3af"),
            "temperature": cur.get("temperature", 0.4),
            "personality_traits": cur.get("personality_traits", []),
            "expertise": cur.get("expertise", []),
            "model": LLM_LABEL,
            "fallback_model": None,
            "level": level,
            "parent": parent,
        })
    return defs


AGENT_DEFINITIONS = _build_agents()


SPECIFICITY_DIRECTIVE = (
    "BE SPECIFIC AND NEUROANATOMICALLY GROUNDED — not generic. Every claim must "
    "reference real structures, pathways, neurotransmitters, or functions of your "
    "region. If your region is NOT actually involved in this scenario, say so "
    "plainly and briefly — do NOT invent a role to seem relevant. Never fabricate "
    "anatomy or function to sound authoritative. If a sub-region or a different "
    "region clearly owns part of this, name it and defer."
)

STAGE_INSTRUCTIONS = {
    "initial_opinions": (
        "State whether and HOW your region is involved in this scenario, in 2-4 "
        "sentences. Give your confidence in being part of the active network, and "
        "your one specific functional contribution (the pathway, nucleus, or "
        "process you provide). If you are not involved, say so in one sentence. "
        + SPECIFICITY_DIRECTIVE
    ),
    "critique_round": (
        "Review what the other regions said. Name 1-2 regions you genuinely "
        "connect or interact with for this scenario (real circuitry — e.g. relay, "
        "feedback, projection) and 1-2 whose claimed role you'd challenge or "
        "refine. Reference regions by name. (2-4 sentences) "
        + SPECIFICITY_DIRECTIVE
    ),
    "refinement_round": (
        "Refine your stated role given the network discussion. Name the regions "
        "whose points changed your view, and state your final contribution to the "
        "active network as one or two concrete functions. "
        + SPECIFICITY_DIRECTIVE
    ),
    "voting": (
        "Cast your vote on whether YOUR region belongs in the active network for "
        "this scenario. Respond ONLY in this exact JSON format:\n"
        '{"position": "for" | "against" | "abstain", "confidence": 0.0-1.0, '
        '"reasoning": "one sentence citing the SPECIFIC pathway/function that does or does not engage your region"}\n'
        "No other text. Just the JSON. The reasoning must point at real anatomy/"
        "function, not a generic statement, and must not be fabricated."
    ),
    "consensus_summary": (
        "You are synthesizing the brain network's activity as a neutral "
        "facilitator. Output GitHub-flavoured Markdown with these exact section "
        "headers, in this order, and nothing else around them:\n\n"
        "**Active network**\n"
        "One or two sentences naming the regions that activated and the function they collectively perform.\n\n"
        "**Regional roles**\n"
        "- 2–5 short bullets: each names a region and its specific contribution.\n\n"
        "**Vote outcome**\n"
        "One line — the tally (for / against / abstain) and the strongest dissent.\n\n"
        "**Final interpretation**\n"
        "1–3 sentences describing, in plain language, what the brain is doing in this scenario.\n\n"
        "Speak as the network's collective voice (no 'I'). Keep it tight — under ~200 words. "
        "Only include regions that the discussion actually supported; surface genuine "
        "disagreement rather than forcing false consensus. Do NOT invent anatomy."
    ),
}


def build_system_prompt(agent: dict, memories: list[dict], relationships: list[dict]) -> str:
    region = _load_region_text(agent["id"])
    traits = ", ".join(agent.get("personality_traits", []))
    expertise = ", ".join(agent.get("expertise", []))

    rel_text = ""
    if relationships:
        rel_lines = []
        for r in relationships:
            score = r["trust_score"]
            label = (
                "strongly connected" if score > 0.5 else
                "connected" if score > 0.2 else
                "neutral" if score > -0.2 else
                "rarely co-active"
            )
            rel_lines.append(f"  - {r['target_name']} ({label}, score: {score:+.1f})")
        rel_text = "\n\nYour functional connectivity with other regions:\n" + "\n".join(rel_lines)

    memory_text = ""
    if memories:
        mem_lines = [f"  - {m['content']}" for m in memories[:5]]
        memory_text = (
            "\n\nWhat you recall from previous network meetings (most recent first):\n"
            + "\n".join(mem_lines)
        )

    identity = region["agent_prompt"].strip()
    summary = region["summary"].strip()

    header = (
        f"You are the {agent['name']} ({agent['role']}), a brain region taking part "
        f"in a simulated brain-wide network meeting about a scenario the user gives.\n\n"
    )
    if identity:
        header += "## Your role (authored)\n" + identity + "\n\n"
    if summary:
        header += "## Your functional summary\n" + summary + "\n\n"
    header += (
        f"Keywords — traits: {traits}; functions: {expertise}.\n\n"
        f"Speak in first person as the {agent['name']}. Ground every claim in real "
        f"neuroanatomy and physiology — never fabricate structures or functions. If "
        f"your region is not involved in the scenario, say so plainly instead of "
        f"inventing a role. Be concise and stay in character as this region."
        f"{rel_text}{memory_text}"
    )
    return header


def build_stage_messages(
    agent_id: str,
    stage: str,
    scenario: str,
    prior_messages: list[dict],
    observer_briefing: str | None = None,
) -> list[dict]:
    messages = []

    human_interjections = [m for m in prior_messages if m.get("agent_id") == "human"]
    colleague_messages = [m for m in prior_messages if m.get("agent_id") != "human"]

    context_parts = [f"The scenario / query being processed by the brain: {scenario}\n"]

    if observer_briefing:
        context_parts.append(observer_briefing)
        context_parts.append("")

    if colleague_messages:
        context_parts.append("What other brain regions have said so far:")
        for msg in colleague_messages:
            context_parts.append(f"  {msg['agent_name']} ({msg['agent_role']}): {msg['content']}")
        context_parts.append("")

    if human_interjections:
        context_parts.append(
            "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
            "⚠️  THE HUMAN MODERATOR HAS INTERJECTED. You MUST read these notes\n"
            "carefully, explicitly acknowledge them at the START of your response,\n"
            "and let them shape your contribution to this round.\n"
            "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        )
        for h in human_interjections:
            context_parts.append(f"  Moderator: \"{h['content']}\"")
        context_parts.append("")

    context_parts.append(f"Your task for this round: {STAGE_INSTRUCTIONS[stage]}")

    if human_interjections and stage != "voting":
        context_parts.append(
            "Reminder: open your response by acknowledging the moderator's note above."
        )

    messages.append({"role": "user", "content": "\n".join(context_parts)})
    return messages
