import json

from brain_system.state import BrainState
from brain_system.config import get_llm_client, LLM_MODEL, LLM_PARAMS


def narrator_node(state: BrainState) -> BrainState:
    """Transform the network consensus into a human-readable narrative."""
    print("[Final Narrator] Generating human-readable explanation...")

    consensus_text = json.dumps(state["consensus"], indent=2)

    system_prompt = (
        "You are a neuroscience narrator. Your job is to translate the output of a "
        "multi-agent brain simulation into clear, engaging, human-readable prose. "
        "Explain which brain regions activated, what each contributed, how they interacted, "
        "and state the final answer. Write in plain English for a general audience."
    )
    user_message = (
        f"Query posed to the brain network: {state['query']}\n\n"
        f"Network consensus:\n{consensus_text}\n\n"
        "Write the final narrative explanation."
    )

    client = get_llm_client()
    try:
        narrative = client.chat.completions.create(
            model=LLM_MODEL,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_message},
            ],
            **LLM_PARAMS,
        ).choices[0].message.content
    except Exception as e:
        narrative = f"[Narrator failed: {e}]"

    return {**state, "final_answer": narrative}
