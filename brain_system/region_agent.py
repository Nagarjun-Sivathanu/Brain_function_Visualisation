import json
import asyncio
from concurrent.futures import ThreadPoolExecutor

from .config import get_llm_client, LLM_MODEL, LLM_PARAMS, REGION_REGISTRY
from .region_loader import load_region_content

_executor = ThreadPoolExecutor(max_workers=13)

VOTE_SCHEMA = """{
  "region": "<region display name>",
  "involved": true or false,
  "confidence": 0.0 to 1.0,
  "functions": ["list of relevant functions"],
  "reasoning": "why you are or are not involved",
  "message_to_network": "what you want to tell other regions",
  "requested_regions": ["regions you want input from"]
}"""

INTERACTION_SCHEMA = """{
  "region": "<region display name>",
  "round": <round number>,
  "contribution": "your specific contribution this round",
  "message_to_network": "message to other active regions"
}"""


class RegionAgent:
    def __init__(self, folder_name: str):
        info = REGION_REGISTRY[folder_name]
        self.folder_name = folder_name
        self.display_name = info["display_name"]
        content = load_region_content(folder_name, info["file_prefix"])
        self.agent_prompt = content["agent_prompt"]
        self.summary = content["summary"]

    def _call_llm(self, system_prompt: str, user_message: str) -> str:
        client = get_llm_client()
        completion = client.chat.completions.create(
            model=LLM_MODEL,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_message},
            ],
            **LLM_PARAMS,
        )
        return completion.choices[0].message.content

    def _build_system_prompt(self) -> str:
        parts = [self.agent_prompt]
        if self.summary:
            parts.append(f"\n\n## Your Functional Summary\n{self.summary}")
        parts.append(
            "\n\nIMPORTANT: You must reply ONLY with valid JSON. No prose, no markdown fences."
        )
        return "\n".join(parts)

    def evaluate_sync(self, query: str) -> dict:
        """Self-relevance evaluation — returns vote dict."""
        system_prompt = self._build_system_prompt()
        user_message = (
            f"A query has been broadcast to all brain regions. Evaluate whether YOU are involved.\n\n"
            f"Query: {query}\n\n"
            f"Reply ONLY with JSON matching this schema:\n{VOTE_SCHEMA}"
        )
        try:
            raw = self._call_llm(system_prompt, user_message)
            # Strip markdown code fences if model adds them
            raw = raw.strip()
            if raw.startswith("```"):
                raw = raw.split("```")[1]
                if raw.startswith("json"):
                    raw = raw[4:]
            result = json.loads(raw.strip())
            result.setdefault("region", self.display_name)
            result.setdefault("involved", False)
            result.setdefault("confidence", 0.0)
            result.setdefault("functions", [])
            result.setdefault("reasoning", "")
            result.setdefault("message_to_network", "")
            result.setdefault("requested_regions", [])
            return result
        except Exception:
            return {
                "region": self.display_name,
                "involved": False,
                "confidence": 0.0,
                "functions": [],
                "reasoning": "Failed to parse LLM response.",
                "message_to_network": "",
                "requested_regions": [],
            }

    def interact_sync(self, query: str, round_num: int, prior_messages: list) -> dict:
        """Interaction round — returns contribution dict."""
        system_prompt = self._build_system_prompt()

        prior_text = "\n".join(
            f"[Round {m['round']}] {m['region']}: {m['content']}"
            for m in prior_messages
        ) or "No prior messages yet."

        round_instructions = {
            1: "Describe your specific contribution to processing this query. What do you do?",
            2: "Review what other regions said. Refine your contribution and resolve any overlaps or conflicts.",
            3: "Produce your final unified interpretation. How does your role integrate with the network?",
        }
        instruction = round_instructions.get(round_num, "Contribute your perspective.")

        user_message = (
            f"You are an active brain region in a multi-agent reasoning network.\n\n"
            f"Query: {query}\n\n"
            f"Network messages so far:\n{prior_text}\n\n"
            f"Round {round_num} instruction: {instruction}\n\n"
            f"Reply ONLY with JSON matching this schema:\n{INTERACTION_SCHEMA}"
        )
        try:
            raw = self._call_llm(system_prompt, user_message)
            raw = raw.strip()
            if raw.startswith("```"):
                raw = raw.split("```")[1]
                if raw.startswith("json"):
                    raw = raw[4:]
            result = json.loads(raw.strip())
            result.setdefault("region", self.display_name)
            result.setdefault("round", round_num)
            result.setdefault("contribution", "")
            result.setdefault("message_to_network", "")
            return result
        except Exception:
            return {
                "region": self.display_name,
                "round": round_num,
                "contribution": "Failed to parse LLM response.",
                "message_to_network": "",
            }

    async def evaluate(self, query: str) -> dict:
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(_executor, self.evaluate_sync, query)

    async def interact(self, query: str, round_num: int, prior_messages: list) -> dict:
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            _executor, self.interact_sync, query, round_num, prior_messages
        )


# Pre-build all 13 agents at import time
ALL_AGENTS: dict[str, RegionAgent] = {
    folder: RegionAgent(folder) for folder in REGION_REGISTRY
}
