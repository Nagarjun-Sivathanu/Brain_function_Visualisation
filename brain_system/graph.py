from langgraph.graph import StateGraph, END

from brain_system.state import BrainState
from brain_system.nodes.broadcast import broadcast_node
from brain_system.nodes.parallel_eval import parallel_eval_node
from brain_system.nodes.vote_collector import vote_collector_node
from brain_system.nodes.region_selector import region_selector_node
from brain_system.nodes.interaction import interaction_node
from brain_system.nodes.consensus import consensus_node
from brain_system.nodes.narrator import narrator_node


def build_graph():
    graph = StateGraph(BrainState)

    graph.add_node("broadcast", broadcast_node)
    graph.add_node("parallel_eval", parallel_eval_node)
    graph.add_node("vote_collector", vote_collector_node)
    graph.add_node("region_selector", region_selector_node)
    graph.add_node("interaction", interaction_node)
    graph.add_node("consensus", consensus_node)
    graph.add_node("narrator", narrator_node)

    graph.set_entry_point("broadcast")
    graph.add_edge("broadcast", "parallel_eval")
    graph.add_edge("parallel_eval", "vote_collector")
    graph.add_edge("vote_collector", "region_selector")
    graph.add_edge("region_selector", "interaction")
    graph.add_edge("interaction", "consensus")
    graph.add_edge("consensus", "narrator")
    graph.add_edge("narrator", END)

    return graph.compile()
