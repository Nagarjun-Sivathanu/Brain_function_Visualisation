import asyncio

from brain_system.state import BrainState
from brain_system.region_agent import ALL_AGENTS


def parallel_eval_node(state: BrainState) -> BrainState:
    """Fire all region agents in parallel and collect their votes."""
    print("[Parallel Eval] All regions self-evaluating simultaneously...")

    async def run_all():
        tasks = [agent.evaluate(state["query"]) for agent in ALL_AGENTS.values()]
        return await asyncio.gather(*tasks)

    results = asyncio.run(run_all())

    region_votes = {}
    for agent, vote in zip(ALL_AGENTS.values(), results):
        vote["region"] = agent.display_name  # force canonical name regardless of LLM output
        region_votes[agent.display_name] = vote

    active_count = sum(1 for v in region_votes.values() if v.get("involved"))
    print(f"  {active_count} regions self-reported as involved.\n")

    return {**state, "region_votes": region_votes}
