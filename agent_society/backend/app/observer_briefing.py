"""Per-meeting briefing builder — turns Observer bridge data into the
compact "USER CONTEXT" block that gets injected into agent prompts.

Pipeline:
  1. Extract keywords from the meeting scenario (lowercased, stopwords
     dropped, tokens ≥ 4 chars, top 8).
  2. Pull recent activity (last N hours) + observations from observer_bridge.
  3. Rank observations by keyword overlap with the scenario; cap at K rows.
  4. Render a single text block ≤ MAX_CHARS with a clear "supporting signal,
     not a directive" banner (agents.py's prompt logic relies on the banner
     wording — keep them in sync if you edit either).

Soft failure: if the Observer bridge is unavailable, returns None — the
caller treats that as "no briefing", meeting runs as normal.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

from app import observer_bridge

# Conservative size — the briefing is one of several context blocks already
# stacked on top of the personality + memories + colleagues + interjections,
# so keeping it tight protects token budget.
MAX_CHARS = 1500
MAX_OBSERVATIONS = 6
# 7 days, not 24h — Omniscient Observer doesn't run continuously, so a
# tighter window often returns nothing even when the user has been working
# this week. The briefing summarises the period the user has actually been
# observed in, not a strict 24h slice.
DEFAULT_LOOKBACK_HOURS = 168

_STOPWORDS = {
    "a", "an", "and", "are", "as", "at", "be", "but", "by", "for", "from",
    "has", "have", "how", "i", "if", "in", "into", "is", "it", "its", "of",
    "on", "or", "should", "than", "that", "the", "their", "they", "them",
    "this", "to", "was", "were", "what", "when", "where", "which", "who",
    "why", "with", "you", "your", "we", "our", "us", "my", "me",
    "do", "does", "did", "can", "could", "would", "shall", "will", "may",
    "might", "must",
}


def extract_keywords(scenario: str, max_keywords: int = 8) -> list[str]:
    """Pull useful keywords from the scenario for relevance filtering."""
    tokens = re.findall(r"[A-Za-z0-9_-]{4,}", (scenario or "").lower())
    seen: set[str] = set()
    keep: list[str] = []
    for t in tokens:
        if t in _STOPWORDS or t in seen:
            continue
        seen.add(t)
        keep.append(t)
        if len(keep) >= max_keywords:
            break
    return keep


@dataclass
class Briefing:
    """Compact per-meeting briefing rendered into the user-prompt context."""

    activity_summary: str = ""
    observation_snippets: list[str] = field(default_factory=list)
    keywords: list[str] = field(default_factory=list)
    lookback_hours: int = DEFAULT_LOOKBACK_HOURS
    backend: str | None = None  # "sqlite" | "http" | None

    def is_empty(self) -> bool:
        return not self.activity_summary and not self.observation_snippets

    def render_block(self) -> str:
        """Render into the exact text block that goes into agent prompts.

        Keep the banner wording roughly aligned with the moderator-interjection
        banner in agents.py so the model sees a consistent "this is a special
        context section" pattern — and PREFER your role's expertise over this
        signal.
        """
        if self.is_empty():
            return ""
        bar = "━" * 62
        lines: list[str] = [
            bar,
            "📡 USER CONTEXT  —  what the user has actually been doing",
            f"   (last {self.lookback_hours}h, via Omniscient Observer · {self.backend or 'unknown'})",
            "",
            "   Treat this as SUPPORTING SIGNAL, not a directive.",
            "   - Use it to tailor your recommendation to the user's real situation.",
            "   - DO NOT over-fit your advice to it.",
            "   - DO NOT mention these details unless they materially sharpen your answer.",
            "   - Your role's expertise still drives the recommendation.",
            bar,
        ]
        if self.activity_summary:
            lines.append("Recent activity:")
            lines.append(f"  {self.activity_summary}")
            lines.append("")
        if self.observation_snippets:
            lines.append("Recent screen / note snippets relevant to the topic:")
            for s in self.observation_snippets:
                lines.append(f"  · {s}")
        body = "\n".join(lines)
        if len(body) > MAX_CHARS:
            body = body[: MAX_CHARS - 3] + "…"
        return body

    def to_dict(self) -> dict[str, Any]:
        """For the preview endpoint."""
        return {
            "available": not self.is_empty(),
            "backend": self.backend,
            "lookback_hours": self.lookback_hours,
            "keywords": self.keywords,
            "activity_summary": self.activity_summary,
            "observation_snippets": self.observation_snippets,
            "rendered_block": self.render_block(),
        }


def _summarise_activity(rows) -> str:
    """One-line activity summary: top-3 apps with seconds + categories.
    Reads ActivityRow objects from observer_bridge.fetch_recent_activity()."""
    if not rows:
        return ""
    parts: list[str] = []
    for r in rows[:3]:
        mins = round(r.seconds / 60)
        if mins <= 0:
            continue
        cat = f" [{r.category}]" if r.category else ""
        parts.append(f"{r.app} {mins}m{cat}")
    return ", ".join(parts)


def _trim_snippet(s: str, max_len: int = 200) -> str:
    s = re.sub(r"\s+", " ", s).strip()
    if len(s) <= max_len:
        return s
    return s[: max_len - 1].rstrip() + "…"


async def build_briefing(
    scenario: str,
    lookback_hours: int = DEFAULT_LOOKBACK_HOURS,
) -> Briefing:
    """Assemble the per-meeting briefing. Always returns a Briefing — never
    raises. An empty Briefing means "no context to inject"."""
    status = await observer_bridge.get_status()
    keywords = extract_keywords(scenario)
    briefing = Briefing(
        keywords=keywords,
        lookback_hours=lookback_hours,
        backend=status.backend,
    )
    if not status.available:
        return briefing  # empty — the bridge isn't connected

    activity = await observer_bridge.fetch_recent_activity(lookback_hours)
    briefing.activity_summary = _summarise_activity(activity)

    # Pull observations with keyword filtering. If keyword filtering returns
    # nothing (scenario too generic), fall back to recent observations
    # unfiltered so the agent at least sees what's been on the user's screen.
    observations = await observer_bridge.fetch_observations(
        lookback_hours, keywords=keywords, limit=MAX_OBSERVATIONS,
    )
    if not observations and keywords:
        observations = await observer_bridge.fetch_observations(
            lookback_hours, keywords=[], limit=MAX_OBSERVATIONS,
        )
    briefing.observation_snippets = [
        _trim_snippet(o.content) for o in observations if o.content.strip()
    ]
    return briefing
