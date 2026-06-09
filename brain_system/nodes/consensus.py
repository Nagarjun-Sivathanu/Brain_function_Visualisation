import json

from brain_system.state import BrainState
from brain_system.config import get_llm_client, LLM_MODEL, LLM_PARAMS

CONSENSUS_SCHEMA = """{
  "active_regions": ["list of region names"],
  "regional_roles": {
    "<region name>": "<role description>"
  },
  "network_decision": {
    "answer": "<the answer to the query>",
    "reasoning": "<how the network arrived at this answer>"
  },
  "confidence": 0.0
}"""


def consensus_node(state: BrainState) -> BrainState:
    """Aggregate all votes and interaction messages into a single consensus."""
    print("[Consensus Generator] Aggregating network activity into consensus...")

    votes_text = json.dumps(
        {k: {f: v[f] for f in ("involved", "confidence", "functions", "reasoning")
             if f in v}
         for k, v in state["region_votes"].items()},
        indent=2,
    )

    messages_text = "\n".join(
        f"[Round {m['round']}] {m['region']}: {m['content']}"
        for m in state["interaction_messages"]
    ) or "No interaction messages."

    system_prompt = (
        "You are the consensus generator for a neuroscience multi-agent brain simulation. "
        "You receive votes and interaction messages from all brain region agents and synthesize "
        "a final network decision. Reply ONLY with valid JSON."
    )
    user_message = (
        f"Original query: {state['query']}\n\n"
        f"Region votes:\n{votes_text}\n\n"
        f"Interaction messages:\n{messages_text}\n\n"
        f"Active regions: {state['active_regions']}\n\n"
        f"Produce a consensus JSON matching this schema:\n{CONSENSUS_SCHEMA}"
    )

    client = get_llm_client()
    try:
        raw = client.chat.completions.create(
            model=LLM_MODEL,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_message},
            ],
            **LLM_PARAMS,
        ).choices[0].message.content

        raw = raw.strip()
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        consensus = json.loads(raw.strip())
    except Exception as e:
        consensus = {
            "active_regions": state["active_regions"],
            "regional_roles": {},
            "network_decision": {"answer": "Could not generate consensus.", "reasoning": str(e)},
            "confidence": 0.0,
        }

    print(f"  Network confidence: {consensus.get('confidence', 0.0):.2f}")
    print(f"  Answer: {consensus.get('network_decision', {}).get('answer', '')}\n")

    return {**state, "consensus": consensus}
