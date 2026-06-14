"""
Ontology access for the brain-meeting orchestrator.

Loads the shared brain hierarchy (cleaned_brain_anatomy.json) and exposes the
parent→children structure the recruitment flow needs. A region's agent id is
simply its ontology name normalized (lowercased, spaces→underscores), which
matches the society's folder/agent ids exactly — so no extra mapping table.

Cross-region "candidate connections" are derived from atlasStructure_filtered.json
Group membership; the orchestrator uses them to seed typed interaction edges.
"""
import os
import re
import json
from pathlib import Path

_DEFAULT_ROOT = Path(__file__).resolve().parents[3]
REGION_ROOT = Path(os.getenv("BRAIN_REGION_ROOT", str(_DEFAULT_ROOT)))
ONTOLOGY_PATH = REGION_ROOT / "cleaned_brain_anatomy.json"
ATLAS_PATH = REGION_ROOT / "atlasStructure_filtered.json"

_PREFIX_RE = re.compile(r"^\s*\d+\)\s*")


def strip_prefix(key: str) -> str:
    return _PREFIX_RE.sub("", key).strip()


def to_id(name: str) -> str:
    """Ontology name -> society agent id ('medulla oblongata' -> 'medulla_oblongata')."""
    return strip_prefix(name).strip().lower().replace(" ", "_")


_tree_cache = None
_child_map_cache = None   # id -> [child ids], with level
_level_cache = None       # id -> level int


def load_tree() -> dict:
    global _tree_cache
    if _tree_cache is None:
        _tree_cache = json.loads(ONTOLOGY_PATH.read_text(encoding="utf-8"))
    return _tree_cache


def _build_maps():
    global _child_map_cache, _level_cache
    if _child_map_cache is not None:
        return
    child_map: dict[str, list[str]] = {}
    level_map: dict[str, int] = {}

    def walk(subtree: dict, level: int):
        for key, child in subtree.items():
            cid = to_id(key)
            level_map[cid] = level
            kids = [to_id(k) for k in child.keys()] if isinstance(child, dict) else []
            child_map[cid] = kids
            if kids:
                walk(child, level + 1)

    walk(load_tree(), 1)
    _child_map_cache, _level_cache = child_map, level_map


def divisions() -> list[str]:
    """Level-2 divisions — the children of the Brain root."""
    _build_maps()
    return _child_map_cache.get("brain", [])


def children(region_id: str) -> list[str]:
    _build_maps()
    return _child_map_cache.get(region_id, [])


def level_of(region_id: str) -> int:
    _build_maps()
    return _level_cache.get(region_id, 99)


def display_name(region_id: str) -> str:
    return region_id.replace("_", " ")


_all_cache = None


def all_regions() -> list[dict]:
    """Every node in the ontology as {id, name, level, parent_id}."""
    global _all_cache
    if _all_cache is not None:
        return _all_cache
    out: list[dict] = []

    def walk(subtree: dict, level: int, parent_id: str | None):
        for key, child in subtree.items():
            nm = strip_prefix(key)
            rid = to_id(nm)
            out.append({"id": rid, "name": nm, "level": level, "parent_id": parent_id})
            if isinstance(child, dict) and child:
                walk(child, level + 1, rid)

    walk(load_tree(), 1, None)
    _all_cache = out
    return out


def region_paths(region_id: str) -> tuple[str, str]:
    """(folder, file_prefix) for a region: folder uses underscores, prefix keeps
    spaces — matching the authored files (medulla_oblongata/ + 'medulla oblongata')."""
    name = display_name(region_id)
    return name.replace(" ", "_"), name


# ── atlas-derived candidate connections (for seeding interaction edges) ──────
_atlas_cache = None


def _atlas_groups() -> dict:
    global _atlas_cache
    if _atlas_cache is not None:
        return _atlas_cache
    groups = {}
    if ATLAS_PATH.exists():
        try:
            for entry in json.loads(ATLAS_PATH.read_text(encoding="utf-8")):
                if entry.get("@type") == "Group" and "member" in entry:
                    name = entry.get("annotation", {}).get("name") or entry.get("@id", "")
                    key = name.lstrip("#").replace("_", " ").strip().lower()
                    members = [m.lstrip("#").replace("_", " ").strip().lower() for m in entry["member"]]
                    groups[key] = members
        except Exception:
            pass
    _atlas_cache = groups
    return groups


def candidate_connections(region_id: str, limit: int = 6) -> list[str]:
    """Anatomically related region ids (group members + siblings), as agent ids."""
    groups = _atlas_groups()
    key = display_name(region_id).lower()
    out, seen = [], set()

    def add(nm):
        rid = to_id(nm)
        if rid and rid != region_id and rid not in seen:
            seen.add(rid)
            out.append(rid)

    if key in groups:
        for m in groups[key]:
            add(m)
    for gname, members in groups.items():
        if key in members:
            add(gname)
            for m in members:
                add(m)
    return out[:limit]
