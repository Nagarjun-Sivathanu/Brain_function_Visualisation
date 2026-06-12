"""
Loads the brain ontology tree and the atlas cross-connection data.

- cleaned_brain_anatomy.json : strict containment hierarchy (the routing tree).
  Keys look like "1) Brain", "2) prosencephalon" — a leading "N) " level prefix.
- atlasStructure_filtered.json : flat list of atlas entries. "Group" entries carry
  a `member` list, which we use to derive cross-region connections beyond the
  strict parent/child tree.

Node identity in this module is the *path* (tuple of clean names from the root),
not the bare name, because some anatomical names repeat in different branches
(e.g. "lateral nuclear group" under both left and right thalamus).
"""
import json
import re
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
ONTOLOGY_PATH = PROJECT_ROOT / "cleaned_brain_anatomy.json"
ATLAS_PATH = PROJECT_ROOT / "atlasStructure_filtered.json"

_PREFIX_RE = re.compile(r"^\s*\d+\)\s*")


def strip_prefix(key: str) -> str:
    """'2) rhombencephalon' -> 'rhombencephalon'."""
    return _PREFIX_RE.sub("", key).strip()


# ----------------------------------------------------------------------------
# Ontology tree
# ----------------------------------------------------------------------------
_ontology_cache = None


def load_ontology() -> dict:
    global _ontology_cache
    if _ontology_cache is None:
        _ontology_cache = json.loads(ONTOLOGY_PATH.read_text(encoding="utf-8"))
    return _ontology_cache


def root_node():
    """Return (root_clean_name, root_subtree_dict)."""
    tree = load_ontology()
    root_key = next(iter(tree))           # "1) Brain"
    return strip_prefix(root_key), tree[root_key]


def children_of(subtree: dict):
    """Given a subtree dict, return list of (clean_name, child_subtree)."""
    return [(strip_prefix(k), v) for k, v in subtree.items()]


# ----------------------------------------------------------------------------
# Atlas cross-connections (derived from Group `member` lists)
# ----------------------------------------------------------------------------
_atlas_cache = None


def _id_to_name(raw_id: str) -> str:
    """'#right_anterior_cingulate_gyrus' -> 'right anterior cingulate gyrus'."""
    return raw_id.lstrip("#").replace("_", " ").strip().lower()


def _load_atlas_groups() -> dict:
    """Return {group_name_lower: [member_name_lower, ...]} for all Group entries."""
    global _atlas_cache
    if _atlas_cache is not None:
        return _atlas_cache

    groups = {}
    if ATLAS_PATH.exists():
        entries = json.loads(ATLAS_PATH.read_text(encoding="utf-8"))
        for entry in entries:
            if entry.get("@type") == "Group" and "member" in entry:
                name = entry.get("annotation", {}).get("name")
                if not name:
                    name = _id_to_name(entry.get("@id", ""))
                members = [_id_to_name(m) for m in entry["member"]]
                groups[name.strip().lower()] = members
    _atlas_cache = groups
    return groups


def get_connections(name: str, limit: int = 8) -> list:
    """
    Cross-region connections for a region, derived from the atlas:
    - if the region is itself a Group: its members.
    - otherwise: the other members of any Group it belongs to (its atlas siblings).
    """
    groups = _load_atlas_groups()
    key = name.strip().lower()
    connections = []

    # Region is a group -> its members are connected sub-parts.
    if key in groups:
        connections.extend(groups[key])

    # Region is a member of some group(s) -> siblings are connected.
    for gname, members in groups.items():
        if key in members:
            connections.append(gname)
            connections.extend(m for m in members if m != key)

    # Dedupe, drop self, cap.
    seen, out = set(), []
    for c in connections:
        if c and c != key and c not in seen:
            seen.add(c)
            out.append(c)
        if len(out) >= limit:
            break
    return out
