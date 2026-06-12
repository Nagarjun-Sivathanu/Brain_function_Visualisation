from langgraph.graph import StateGraph, END

from .state import HierState
from .nodes import route_node, debate_node, consensus_node, narrator_node


def build_hierarchy_graph():
    graph = StateGraph(HierState)

    graph.add_node("route", route_node)
    graph.add_node("debate", debate_node)
    graph.add_node("consensus", consensus_node)
    graph.add_node("narrator", narrator_node)

    graph.set_entry_point("route")
    graph.add_edge("route", "debate")
    graph.add_edge("debate", "consensus")
    graph.add_edge("consensus", "narrator")
    graph.add_edge("narrator", END)

    return graph.compile()
