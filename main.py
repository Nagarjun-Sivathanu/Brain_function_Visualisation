import sys
import json

from brain_system.graph import build_graph


def run(query: str):
    graph = build_graph()

    initial_state = {
        "query": query,
        "region_votes": {},
        "active_regions": [],
        "interaction_messages": [],
        "consensus": {},
        "final_answer": "",
    }

    final_state = graph.invoke(initial_state)

    print("=" * 70)
    print("FINAL NETWORK NARRATIVE")
    print("=" * 70)
    print(final_state["final_answer"])
    print()
    print("=" * 70)
    print("CONSENSUS SUMMARY (JSON)")
    print("=" * 70)
    print(json.dumps(final_state["consensus"], indent=2))


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python main.py \"your query here\"")
        sys.exit(1)
    run(" ".join(sys.argv[1:]))
