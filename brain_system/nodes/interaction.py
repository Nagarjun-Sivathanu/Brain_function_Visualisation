import asyncio

from brain_system.state import BrainState
from brain_system.region_agent import ALL_AGENTS
from brain_system.config import REGION_REGISTRY

# Map display_name -> RegionAgent
_display_to_agent = {
    agent.display_name: agent for agent in ALL_AGENTS.values()
}


def interaction_node(state: BrainState) -> BrainState:
    """
    Run 3 rounds of inter-region interaction for all active regions.
    Each round: all active regions call interact() in parallel.
    """
    active_regions = state["active_regions"]
    if not active_regions:
        print("[Interaction] No active regions — skipping interaction rounds.\n")
        return {**state, "interaction_messages": []}

    print(f"[Interaction] Starting 3 rounds for {len(active_regions)} active regions...\n")
    all_messages = []

    async def run_round(round_num: int, prior: list):
        agents = [_display_to_agent[name] for name in active_regions if name in _display_to_agent]
        tasks = [agent.interact(state["query"], round_num, prior) for agent in agents]
        results = await asyncio.gather(*tasks)
        return results

    for round_num in range(1, 4):
        print(f"  -- Round {round_num} --")
        results = asyncio.run(run_round(round_num, all_messages))
        for r in results:
            msg = {
                "round": round_num,
                "region": r.get("region", "Unknown"),
                "content": r.get("contribution", "") + " | " + r.get("message_to_network", ""),
            }
            all_messages.append(msg)
            print(f"    [{r.get('region')}] {r.get('contribution', '')[:120]}")
        print()

    return {**state, "interaction_messages": all_messages}
