from brain_system.state import BrainState


def vote_collector_node(state: BrainState) -> BrainState:
    """Log all votes — region_votes already set by parallel_eval."""
    print("[Vote Collector] Collected votes from all regions:")
    for region, vote in sorted(state["region_votes"].items()):
        involved = vote.get("involved", False)
        conf = vote.get("confidence", 0.0)
        marker = "YES" if involved else " no"
        print(f"  [{marker}] {region:<30} confidence={conf:.2f}")
    print()
    return state
