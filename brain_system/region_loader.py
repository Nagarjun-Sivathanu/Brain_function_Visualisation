import os
from pathlib import Path

BASE_DIR = Path(__file__).parent.parent


def load_region_content(folder_name: str, file_prefix: str) -> dict:
    """Load agent_prompt and summary text for a brain region."""
    folder = BASE_DIR / folder_name

    prompt_path = folder / f"{file_prefix}_agent_prompt.md"
    summary_path = folder / f"{file_prefix}_summary.md"

    agent_prompt = prompt_path.read_text(encoding="utf-8") if prompt_path.exists() else ""
    summary = summary_path.read_text(encoding="utf-8") if summary_path.exists() else ""

    return {"agent_prompt": agent_prompt, "summary": summary}
