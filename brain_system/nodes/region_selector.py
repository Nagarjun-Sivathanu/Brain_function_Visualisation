from brain_system.state import BrainState
from brain_system.config import REGION_REGISTRY, CONFIDENCE_THRESHOLD


def _build_display_to_parent() -> dict:
    """Map display_name -> parent display_name."""
    return {
        info["display_name"]: info["parent"]
        for info in REGION_REGISTRY.values()
    }


def region_selector_node(state: BrainState) -> BrainState:
    """
    Select active regions:
    1. Threshold filter: involved=True AND confidence > CONFIDENCE_THRESHOLD
    2. Sub-region priority: remove a parent if at least one of its children
       passes threshold with equal or higher confidence than the parent.
    """
    votes = state["region_votes"]
    display_to_parent = _build_display_to_parent()

    # Step 1: threshold filter
    candidates = {
        name: vote
        for name, vote in votes.items()
        if vote.get("involved") and vote.get("confidence", 0.0) > CONFIDENCE_THRESHOLD
    }

    # Step 2: sub-region priority — remove parent if any child supersedes it
    parents_to_remove = set()
    for name, vote in candidates.items():
        parent = display_to_parent.get(name)
        if parent and parent in candidates:
            child_conf = vote.get("confidence", 0.0)
            parent_conf = candidates[parent].get("confidence", 0.0)
            if child_conf >= parent_conf:
                parents_to_remove.add(parent)

    active_regions = [n for n in candidates if n not in parents_to_remove]

    print(f"[Region Selector] Active regions after threshold ({CONFIDENCE_THRESHOLD}) + sub-region priority:")
    for name in sorted(active_regions):
        conf = candidates[name].get("confidence", 0.0)
        print(f"  * {name:<30} confidence={conf:.2f}")
    if not active_regions:
        print("  (no regions activated above threshold)")
    print()

    return {**state, "active_regions": active_regions}
