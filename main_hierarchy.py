"""
Hierarchical routing demo (graph_flow).

The query always enters at the Brain root, which decides which sub-regions
should receive it, recursing top-down through the ontology until the deepest
relevant regions activate. Those regions debate, a consensus is formed, and a
final narrative plus the full routing path are reported.

This is fully separate from the broadcast model — run that with `python main.py`.

Usage:
    python main_hierarchy.py "What happens when you recognize a friend's face?"
"""
import sys
import json

from brain_system.hierarchy.graph import build_hierarchy_graph


def run(query: str):
    graph = build_hierarchy_graph()

    initial_state = {
        "query": query,
        "routing_path": [],
        "activated_regions": [],
        "region_reports": {},
        "debate_messages": [],
        "cross_connections": {},
        "consensus": {},
        "final_answer": "",
    }

    final_state = graph.invoke(initial_state)

    print("=" * 70)
    print("FINAL NETWORK NARRATIVE")
    print("=" * 70)
    print(final_state["final_answer"])

    print("\n" + "=" * 70)
    print("ROUTING PATH (top-down route the query travelled)")
    print("=" * 70)
    print(json.dumps(final_state["routing_path"], indent=2))

    print("\n" + "=" * 70)
    print("ACTIVATED REGIONS (full paths)")
    print("=" * 70)
    print(json.dumps(
        [{"name": a["name"], "path": " -> ".join(a["path"]), "confidence": a["confidence"]}
         for a in final_state["activated_regions"]],
        indent=2,
    ))

    print("\n" + "=" * 70)
    print("CONSENSUS SUMMARY (JSON)")
    print("=" * 70)
    print(json.dumps(final_state["consensus"], indent=2))


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print('Usage: python main_hierarchy.py "your query here"')
        sys.exit(1)
    run(" ".join(sys.argv[1:]))
