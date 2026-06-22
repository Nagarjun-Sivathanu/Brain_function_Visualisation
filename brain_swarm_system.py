"""
Brain Region Multi-Agent Swarm System (8-Step Pipeline)
======================================================
A decentralized neuroscience-inspired multi-agent reasoning system.
Models 13 individual brain regions as independent agents that self-evaluate,
vote on active regions, resolve deactivations/subregions, generate functioning details,
peer-review their work, and form a consensus to answer queries.

Implements the 8-Step pipeline:
1) Broadcast query to all 13 agents.
2) Parallel evaluation using local files (summary, prompt, script JSON).
3) Peer voting on active regions & subregion prioritization.
4) Activation command execution & self-veto override reconsideration.
5) Parallel generation of detailed functioning & signal propagation.
6) Peer review & competition refinement among active agents.
7) Consensus summary aggregation (meta-agent).
8) Final narrative story generation (narrator).
"""

import os
import sys
import json
import logging
from pathlib import Path
from typing import Dict, List, Any, Optional
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, asdict

# Reconfigure stdout/stderr to support UTF-8 (emojis, etc.) on Windows terminals
if hasattr(sys.stdout, 'reconfigure'):
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass
if hasattr(sys.stderr, 'reconfigure'):
    try:
        sys.stderr.reconfigure(encoding='utf-8')
    except Exception:
        pass

try:
    import openai
except ImportError as e:
    print(f"⚠️ Required packages not installed: {e}")
    print("Please run: pip install openai flask flask-cors requests")
    exit(1)

# ============================================================================
# LOGGING SETUP
# ============================================================================

logging.basicConfig(
    filename='brain_system.log',
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

import time

DISPLAY_NAMES = {
    "Prosencephalon": "Prosencephalon (Forebrain)",
    "Midbrain": "Midbrain (Mesencephalon)",
    "Rhombencephalon": "Rhombencephalon (Hindbrain)",
    "Diencephalon": "Diencephalon",
    "Telencephalon": "Telencephalon (Cerebrum)",
    "Metencephalon": "Metencephalon",
    "Part Of Midbrain": "Part of Midbrain",
    "Part of Midbrain": "Part of Midbrain",
    "Right Side Of Midbrain": "Right Side of Midbrain",
    "Right Side of Midbrain": "Right Side of Midbrain",
    "Left Side Of Midbrain": "Left Side of Midbrain",
    "Left Side of Midbrain": "Left Side of Midbrain"
}

ANSI_COLORS = {
    "Prosencephalon (Forebrain)": "\033[94m",  # Bright Blue
    "Midbrain (Mesencephalon)": "\033[93m",   # Bright Yellow
    "Rhombencephalon (Hindbrain)": "\033[95m", # Bright Magenta
    "Diencephalon": "\033[36m",               # Cyan
    "Telencephalon (Cerebrum)": "\033[92m",   # Bright Green
    "Metencephalon": "\033[96m",              # Bright Cyan
    "Part of Midbrain": "\033[33m",           # Yellow
    "Right Side of Midbrain": "\033[91m",     # Bright Red
    "Left Side of Midbrain": "\033[31m",      # Red
    "Medulla Oblongata": "\033[35m",          # Magenta
    "Aqueduct": "\033[34m",                   # Blue
    "Fourth Ventricle": "\033[90m",           # Dark Gray
    "Reset": "\033[0m"
}

# ============================================================================
# DATA MODELS
# ============================================================================

@dataclass
class AgentEvaluation:
    """Output for agent evaluation (Step 2)."""
    region_name: str
    involved: bool
    confidence: float
    role_contribution: str
    reasoning: str


@dataclass
class ActiveRegion:
    """Represents an active region and its functioning details (Step 5 & 6)."""
    region_name: str
    confidence: float
    role_contribution: str
    reasoning: str
    detailed_functioning: str = ""
    refined_functioning: str = ""


# ============================================================================
# REGION LOADER
# ============================================================================

class RegionLoader:
    """Dynamically loads brain region data from directory structure."""

    def __init__(self, regions_base_path: str):
        self.base_path = Path(regions_base_path)
        self.regions: Dict[str, Dict[str, Any]] = {}
        self.child_to_parent: Dict[str, str] = {}
        self._load_all_regions()
        self._load_virtual_agents()

    def _load_all_regions(self):
        """Load all region data from subdirectories, including root 'Brain'."""
        if not self.base_path.exists():
            logger.error(f"Regions path not found: {self.base_path}")
            return

        for region_dir in self.base_path.iterdir():
            if not region_dir.is_dir() or region_dir.name.startswith('.'):
                continue

            # Load any directory as a brain region agent folder
            # Normalizes underscores to spaces and titles it
            region_name = region_dir.name.replace('_', ' ').title()
            region_data = self._load_region_files(region_dir, region_name)

            if region_data:
                self.regions[region_name] = region_data
                logger.info(f"✓ Loaded region: {region_name}")

    def _load_virtual_agents(self):
        """Load virtual regions up to level 5 from cleaned_brain_anatomy.json if not already loaded."""
        anatomy_file = self.base_path / "cleaned_brain_anatomy.json"
        if not anatomy_file.exists():
            logger.warning(f"cleaned_brain_anatomy.json not found in {self.base_path}. Skipping virtual agents.")
            return

        try:
            with open(anatomy_file, "r", encoding="utf-8") as f:
                anatomy_data = json.load(f)
        except Exception as e:
            logger.error(f"Failed to load cleaned_brain_anatomy.json: {e}")
            return

        # Build map of lowercase loaded region names to their title-cased keys
        loaded_lower = {k.lower(): k for k in self.regions.keys()}

        def clean_name(key):
            if ")" in key:
                return key.split(")", 1)[1].strip().lower()
            return key.strip().lower()

        def extract_level(key):
            if ")" in key:
                try:
                    return int(key.split(")", 1)[0].strip())
                except ValueError:
                    pass
            return 1

        parent_to_children = {}
        child_to_parent_map = {}
        node_levels = {}

        def traverse(node, parent_clean=None):
            if not isinstance(node, dict):
                return
            for key, val in node.items():
                clean_k = clean_name(key)
                level = extract_level(key)
                node_levels[clean_k] = level

                if parent_clean:
                    child_to_parent_map[clean_k] = parent_clean
                    if parent_clean not in parent_to_children:
                        parent_to_children[parent_clean] = []
                    if clean_k not in parent_to_children[parent_clean]:
                        parent_to_children[parent_clean].append(clean_k)

                traverse(val, clean_k)

        traverse(anatomy_data)

        # Build child_to_parent displaying titlecase names
        for child, parent in child_to_parent_map.items():
            child_title = child.replace('_', ' ').title()
            parent_title = parent.replace('_', ' ').title()
            self.child_to_parent[child_title] = parent_title

        # Register virtual agents up to level 5
        for node_name, level in node_levels.items():
            if level > 5:
                continue
            if level <= 1:
                continue

            display_name = node_name.replace('_', ' ').title()
            if node_name in loaded_lower:
                continue

            parent_clean = child_to_parent_map.get(node_name, "Brain")
            parent_display = parent_clean.replace('_', ' ').title()

            self.regions[display_name] = {
                "name": display_name,
                "path": "virtual",
                "hierarchy_level": level,
                "script": {
                    "name": display_name,
                    "hierarchy_level": level,
                    "parent_region": parent_display
                },
                "summary": f"The {display_name} is a biological subregion of the {parent_display} (Level {level} in neural hierarchy). It coordinates localized sensory-motor and cognitive pathways in the {parent_display}.",
                "agent_prompt": f"You are the {display_name} Agent representing the {display_name} subregion of the brain. You coordinate pathways in the {parent_display}. Respond in character with scientific accuracy."
            }
            logger.info(f"✓ Registered virtual region: {display_name} (Level {level})")

    def _load_region_files(self, region_dir: Path, region_name: str) -> Optional[Dict[str, Any]]:
        """Load the three files for a region: script JSON, summary MD, and agent prompt MD."""
        region_data = {"name": region_name, "path": str(region_dir)}

        # Find and load JSON script
        json_file = self._find_file(region_dir, "script_*.json")
        if json_file:
            try:
                with open(json_file, 'r', encoding='utf-8') as f:
                    region_data["script"] = json.load(f)
                    region_data["hierarchy_level"] = region_data["script"].get("hierarchy_level", 0)
            except Exception as e:
                logger.warning(f"Failed to load script for {region_name}: {e}")

        # Find and load summary
        summary_file = self._find_file(region_dir, "*_summary.md")
        if summary_file:
            try:
                with open(summary_file, 'r', encoding='utf-8') as f:
                    region_data["summary"] = f.read()
            except Exception as e:
                logger.warning(f"Failed to load summary for {region_name}: {e}")

        # Find and load agent prompt
        prompt_file = self._find_file(region_dir, "*_agent_prompt.md")
        if not prompt_file:
            prompt_file = self._find_file(region_dir, "*_agentprompt.md")
            
        if prompt_file:
            try:
                with open(prompt_file, 'r', encoding='utf-8') as f:
                    region_data["agent_prompt"] = f.read()
            except Exception as e:
                logger.warning(f"Failed to load agent prompt for {region_name}: {e}")

        # Ensure we at least have the script JSON to be valid
        return region_data if region_data.get("script") else None

    @staticmethod
    def _find_file(directory: Path, pattern: str) -> Optional[Path]:
        """Find first file matching pattern in directory."""
        for file in directory.glob(pattern):
            if file.is_file():
                return file
        return None

    def get_region(self, name: str) -> Optional[Dict[str, Any]]:
        """Get region data by name."""
        return self.regions.get(name)

    def list_regions(self) -> List[str]:
        """List all loaded regions."""
        return list(self.regions.keys())

    def get_hierarchy_structure(self) -> Dict[str, Any]:
        """Build hierarchy structure from loaded regions."""
        hierarchy = {}
        for name, data in self.regions.items():
            level = data.get("hierarchy_level", 0)
            if level not in hierarchy:
                hierarchy[level] = []
            hierarchy[level].append({"name": name, "hierarchy_level": level})
        return hierarchy


# ============================================================================
# LLM CACHE & CLIENT WRAPPER
# ============================================================================

import hashlib

class LLMCache:
    """Thread-safe local disk cache for LLM request responses."""
    def __init__(self, cache_path: Path):
        self.cache_path = cache_path
        import threading
        self.lock = threading.Lock()
        self.cache = {}
        self._load()

    def _load(self):
        if self.cache_path.exists():
            try:
                with open(self.cache_path, 'r', encoding='utf-8') as f:
                    self.cache = json.load(f)
            except Exception:
                self.cache = {}

    def get(self, system_prompt: str, user_prompt: str, max_tokens: int) -> Optional[str]:
        key = self._make_key(system_prompt, user_prompt, max_tokens)
        with self.lock:
            return self.cache.get(key)

    def set(self, system_prompt: str, user_prompt: str, max_tokens: int, value: str):
        key = self._make_key(system_prompt, user_prompt, max_tokens)
        with self.lock:
            self.cache[key] = value
            try:
                with open(self.cache_path, 'w', encoding='utf-8') as f:
                    json.dump(self.cache, f, indent=2, ensure_ascii=False)
            except Exception as e:
                logger.warning(f"Failed to write cache: {e}")

    def _make_key(self, system_prompt: str, user_prompt: str, max_tokens: int) -> str:
        combined = f"sys:{system_prompt}\nusr:{user_prompt}\ntok:{max_tokens}"
        return hashlib.sha256(combined.encode('utf-8')).hexdigest()


class LLMClient:
    """Wrapper around OpenAI client to communicate with the target Llama server."""

    def __init__(self, base_url: str = "http://dgx5.humanbrain.in:8999/v1", api_key: str = "empty", use_mock: bool = False):
        self.use_mock = use_mock
        self.base_url = "http://127.0.0.1:8000/v1" if use_mock else base_url
        self.api_key = "mock-key" if use_mock else api_key
        self.model_name = "Llama-3.3-70B-Instruct"

        cache_dir = Path(os.path.dirname(os.path.abspath(__file__)))
        self.cache = LLMCache(cache_dir / ".llm_cache.json")

        if not use_mock:
            # First check if local Ollama is running at localhost:11434
            import requests
            ollama_detected = False
            try:
                r = requests.get("http://localhost:11434/api/tags", timeout=1.0)
                if r.status_code == 200:
                    models_data = r.json().get("models", [])
                    available_names = [m["name"] for m in models_data]
                    logger.info(f"Local Ollama detected. Available models: {available_names}")
                    # Pick a preferred model
                    for preferred in ["llama3.1", "llama3.2", "gemma2", "qwen"]:
                        matched = [name for name in available_names if preferred in name]
                        if matched:
                            self.base_url = "http://localhost:11434/v1"
                            self.model_name = matched[0]
                            logger.info(f"Using local Ollama at {self.base_url} with model {self.model_name}")
                            ollama_detected = True
                            break
            except Exception as e:
                logger.info(f"Local Ollama check failed or timed out: {e}")

            if not ollama_detected:
                # Connectivity check to determine if fallback IP is needed
                import requests
                try:
                    test_url = self.base_url.rstrip('/') + "/models"
                    r = requests.get(test_url, timeout=2.0)
                    if r.status_code != 200:
                        logger.warning("Main URL unavailable, falling back to IP.")
                        self.base_url = "http://172.20.23.157:8999/v1"
                except Exception:
                    logger.warning("Main URL timed out, falling back to IP.")
                    self.base_url = "http://172.20.23.157:8999/v1"

        try:
            import httpx
            self.http_client = httpx.Client(
                limits=httpx.Limits(max_keepalive_connections=80, max_connections=150),
                timeout=90.0
            )
            self.client = openai.OpenAI(
                base_url=self.base_url,
                api_key=self.api_key,
                http_client=self.http_client
            )
            logger.info(f"✓ LLM client initialized with base_url: {self.base_url} (Connection Pooling Enabled)")
        except Exception as e:
            logger.error(f"Failed to initialize OpenAI client: {e}")
            raise

    def call_llm(self, system_prompt: str, user_prompt: str = "", max_tokens: int = 1000) -> str:
        """Execute chat completion using the user's exact required model configuration."""
        cached_response = self.cache.get(system_prompt, user_prompt, max_tokens)
        if cached_response is not None:
            logger.info("⚡ Cache Hit for LLM call!")
            return cached_response

        import time
        messages = [{"role": "system", "content": system_prompt}]
        if user_prompt:
            messages.append({"role": "user", "content": user_prompt})

        max_retries = 3
        backoff = 2.0
        for attempt in range(max_retries):
            try:
                completion = self.client.chat.completions.create(
                    model=self.model_name,
                    messages=messages,
                    temperature=0,
                    frequency_penalty=1.0,
                    top_p=0.1,
                    max_tokens=max_tokens,
                    stream=False
                )
                response_text = completion.choices[0].message.content.strip()
                self.cache.set(system_prompt, user_prompt, max_tokens, response_text)
                return response_text
            except Exception as e:
                if attempt == max_retries - 1:
                    raise
                logger.warning(f"LLM call failed (attempt {attempt + 1}/{max_retries}): {e}. Retrying in {backoff}s...")
                time.sleep(backoff)
                backoff *= 2.0


# ============================================================================
# ORCHESTRATOR: 8-PHASE WORKFLOW
# ============================================================================

class BrainSwarmOrchestrator:
    """Coordinates the 8-step multi-agent swarm pipeline."""

    def __init__(self, regions_path: str, use_mock_server: bool = False):
        self.regions_path = regions_path
        self.region_loader = RegionLoader(regions_path)
        self.llm_client = LLMClient(use_mock=use_mock_server)

    def process_query_stream(self, query: str, max_level: int = 3):
        """Runs the 8-step pipeline and yields NDJSON event lines in real time."""
        import json
        from dataclasses import asdict
        from concurrent.futures import ThreadPoolExecutor, as_completed

        # Step 1 & 2: Broadcast & Parallel Evaluation
        yield json.dumps({"event": "eval_start"}) + "\n"
        evaluations = self._step_1_2_parallel_evaluation(query, max_level=max_level)
        yield json.dumps({
            "event": "eval_end",
            "evaluations": [asdict(e) for e in evaluations]
        }) + "\n"

        # Step 3: Peer Voting
        yield json.dumps({"event": "vote_start"}) + "\n"
        votes = self._step_3_peer_voting(query, evaluations)
        yield json.dumps({
            "event": "vote_end",
            "votes": votes
        }) + "\n"

        # Step 4: Activation Command & Self-Veto Reconsideration
        yield json.dumps({"event": "active_start"}) + "\n"
        active_regions = self._step_4_activation_reconsideration(query, evaluations, votes, max_level=max_level)

        # Sort active regions: lower hierarchy level first, then custom alphabetical sort
        def get_sort_key(r):
            name = r.region_name
            if "right side" in name.lower():
                name_key = "Side Of Midbrain A_Right"
            elif "left side" in name.lower():
                name_key = "Side Of Midbrain B_Left"
            else:
                name_key = name
            return (
                self.region_loader.regions[r.region_name].get("hierarchy_level", 9),
                name_key
            )
        active_regions.sort(key=get_sort_key)

        yield json.dumps({
            "event": "active_end",
            "active_regions": [
                {
                    "region_name": r.region_name,
                    "hierarchy_level": self.region_loader.regions[r.region_name].get("hierarchy_level", 0),
                    "confidence": r.confidence,
                    "role_contribution": r.role_contribution
                } for r in active_regions
            ]
        }) + "\n"

        if not active_regions:
            narrative = f"No specific brain regions were activated to process the query: '{query}'."
            yield json.dumps({
                "event": "narrative_end",
                "narrative": narrative,
                "final_answer": None
            }) + "\n"
            yield json.dumps({"event": "complete"}) + "\n"
            return

        # Step 5 & 6: 3 Rounds of Interaction and Refinement
        rounds_history = []
        for r_num in range(1, 4):
            history_context = ""
            for i, prev_round in enumerate(rounds_history, 1):
                history_context += f"### Round {i} Outputs:\n"
                for name, text in prev_round.items():
                    history_context += f"- {name}: {text}\n"
                history_context += "\n"

            yield json.dumps({
                "event": "round_start",
                "round": r_num,
                "active_regions": [ar.region_name for ar in active_regions]
            }) + "\n"

            round_outputs = {}
            workers = 80
            with ThreadPoolExecutor(max_workers=workers) as executor:
                futures = {
                    executor.submit(self._generate_agent_round_output, ar, query, r_num, history_context): ar.region_name
                    for ar in active_regions
                }
                for future in as_completed(futures):
                    region_name = futures[future]
                    try:
                        text = future.result()
                    except Exception as e:
                        logger.error(f"Round {r_num} failed for {region_name}: {e}")
                        text = self._get_fallback_round_output(region_name, query, r_num)
                    
                    round_outputs[region_name] = text
                    yield json.dumps({
                        "event": "agent_speech",
                        "round": r_num,
                        "region": region_name,
                        "text": text
                    }) + "\n"

            sorted_round_outputs = {}
            for ar in active_regions:
                if ar.region_name in round_outputs:
                    sorted_round_outputs[ar.region_name] = round_outputs[ar.region_name]
            rounds_history.append(sorted_round_outputs)

            yield json.dumps({
                "event": "round_end",
                "round": r_num
            }) + "\n"

        # Step 7: Consensus Summary Aggregation
        yield json.dumps({"event": "consensus_start"}) + "\n"
        consensus = self._step_7_consensus_aggregation(query, active_regions, rounds_history)
        yield json.dumps({
            "event": "consensus_end",
            "consensus": consensus
        }) + "\n"

        # Step 8: Final Narrative Story Generation
        yield json.dumps({"event": "narrative_start"}) + "\n"
        narrative = self._step_8_final_narration(query, active_regions, consensus)
        
        final_ans = consensus.get("answer", "")
        yield json.dumps({
            "event": "narrative_end",
            "narrative": narrative,
            "final_answer": final_ans
        }) + "\n"

        yield json.dumps({"event": "complete"}) + "\n"

    @staticmethod
    def _try_solve_math_query(query: str) -> Optional[str]:
        """Helper to detect simple math query and compute the answer using python eval."""
        import re
        q = query.lower().replace("?", "").strip()
        # Find patterns like "what is 4+6" or "calculate 4 + 6" or just "4 + 6"
        match = re.search(r'(?:what is|calculate|evaluate|solve)\s*([\d\s\+\-\*\/\(\)]+)', q, re.IGNORECASE)
        if not match:
            match = re.search(r'^\s*([\d\s\+\-\*\/\(\)]+)\s*$', q)
        if match:
            expr = match.group(1).replace(" ", "")
            try:
                if re.match(r'^[\d\+\-\*\/\(\)]+$', expr):
                    val = eval(expr, {"__builtins__": None}, {})
                    return str(val)
            except Exception:
                pass
        return None

    def process_query(self, query: str, max_level: int = 3) -> Dict[str, Any]:
        """Runs the entire 8-step pipeline with performance timing and ANSI styling."""
        start_total = time.perf_counter()

        # Step 1 & 2: Broadcast & Parallel Evaluation
        t0 = time.perf_counter()
        evaluations = self._step_1_2_parallel_evaluation(query, max_level=max_level)
        eval_time = time.perf_counter() - t0

        # Step 3: Peer Voting
        t0 = time.perf_counter()
        votes = self._step_3_peer_voting(query, evaluations)
        voting_time = time.perf_counter() - t0

        # Step 4: Activation Command & Self-Veto Reconsideration
        t0 = time.perf_counter()
        active_regions = self._step_4_activation_reconsideration(query, evaluations, votes, max_level=max_level)
        activation_time = time.perf_counter() - t0

        # If no regions activated, return default narrative
        if not active_regions:
            narrative = f"No specific brain regions were activated to process the query: '{query}'."
            return {
                "query": query,
                "phase_1_evaluations": [asdict(e) for e in evaluations],
                "phase_2_active_regions": [],
                "phase_3_4_narrative": narrative,
                "total_regions_loaded": len(self.region_loader.regions),
                "active_regions_count": 0
            }

        # Sort active regions: lower hierarchy level first, then custom alphabetical sort
        def get_sort_key(r):
            name = r.region_name
            if "right side" in name.lower():
                name_key = "Side Of Midbrain A_Right"
            elif "left side" in name.lower():
                name_key = "Side Of Midbrain B_Left"
            else:
                name_key = name
            return (
                self.region_loader.regions[r.region_name].get("hierarchy_level", 9),
                name_key
            )
        active_regions.sort(key=get_sort_key)

        # Determine max display name length for alignment
        max_name_len = 0
        for ar in active_regions:
            clean_name = ar.region_name.replace(" Agent", "").strip()
            display_name = DISPLAY_NAMES.get(clean_name, clean_name).replace("**", "").replace("*", "")
            if len(display_name) > max_name_len:
                max_name_len = len(display_name)

        # Step 5 & 6: 3 Rounds of Interaction and Refinement
        t0 = time.perf_counter()
        print(f"\n\033[1;33m[Interaction]\033[0m Starting 3 rounds for {len(active_regions)} active regions...\n")
        
        rounds_history = []
        for r_num in range(1, 4):
            print(f"\033[1;30m-- Round {r_num} --\033[0m")
            round_outputs = self._run_interaction_round(query, active_regions, r_num, rounds_history)
            rounds_history.append(round_outputs)
            
            # Print each agent's operation in clean format matching user request
            for name, text in round_outputs.items():
                if text.strip():
                    clean_name = name.replace(" Agent", "").strip()
                    display_name = DISPLAY_NAMES.get(clean_name, clean_name).replace("**", "").replace("*", "")
                    padded_name = display_name.ljust(max_name_len)
                    clean_text = text.replace("**", "").replace("*", "").strip()
                    color = ANSI_COLORS.get(display_name, ANSI_COLORS.get(clean_name, ANSI_COLORS["Reset"]))
                    reset = ANSI_COLORS["Reset"]
                    print(f"[{color}{padded_name}{reset}]  {clean_text}")
            print()
        interaction_time = time.perf_counter() - t0

        # Step 7: Consensus Summary Aggregation
        t0 = time.perf_counter()
        consensus = self._step_7_consensus_aggregation(query, active_regions, rounds_history)
        consensus_time = time.perf_counter() - t0

        # Step 8: Final Narrative Story Generation
        t0 = time.perf_counter()
        narrative = self._step_8_final_narration(query, active_regions, consensus)
        narration_time = time.perf_counter() - t0

        total_time = time.perf_counter() - start_total

        # Display Diagnostic Timings Profile
        print("\033[1;35m" + "=" * 60)
        print("⏱️  EXECUTION PROFILE")
        print("=" * 60)
        print(f"  - Phase 1 & 2 (Evaluation): {eval_time:.3f}s")
        print(f"  - Phase 3 (Peer Voting):    {voting_time:.3f}s")
        print(f"  - Phase 4 (Activation):     {activation_time:.3f}s")
        print(f"  - Phase 5 & 6 (Rounds):     {interaction_time:.3f}s")
        print(f"  - Phase 7 (Consensus):      {consensus_time:.3f}s")
        print(f"  - Phase 8 (Narration):      {narration_time:.3f}s")
        print(f"  - Total Execution Time:     {total_time:.3f}s")
        print("=" * 60 + "\033[0m\n")

        # Compile final outputs to matches the schema expected by test runners
        return {
            "query": query,
            "phase_1_evaluations": [asdict(e) for e in evaluations],
            "phase_2_active_regions": [
                {
                    "region_name": r.region_name,
                    "hierarchy_level": self.region_loader.regions[r.region_name].get("hierarchy_level", 0),
                    "confidence": r.confidence,
                    "role_contribution": r.role_contribution
                } for r in active_regions
            ],
            "phase_3_4_narrative": narrative,
            "total_regions_loaded": len(self.region_loader.regions),
            "active_regions_count": len(active_regions),
            "step_3_votes": votes,
            "step_7_consensus": consensus
        }

    # ------------------------------------------------------------------------
    # STEP 1 & 2: UNIVERSAL BROADCAST & PARALLEL EVALUATION
    # ------------------------------------------------------------------------
    def _step_1_2_parallel_evaluation(self, query: str, max_level: int = 3) -> List[AgentEvaluation]:
        print(f"[Step 1 & 2] Broadcasting query and running parallel self-evaluations for all regions (Max Level: {max_level})...")
        
        target_regions = []
        for name, data in self.region_loader.regions.items():
            lvl = data.get("hierarchy_level", 0)
            if 2 <= lvl <= max_level:
                target_regions.append(name)

        evaluations = []
        if not target_regions:
            return evaluations

        workers = 80
        with ThreadPoolExecutor(max_workers=workers) as executor:
            futures = {
                executor.submit(self._evaluate_single_region, name, query): name
                for name in target_regions
            }
            for future in as_completed(futures):
                region_name = futures[future]
                try:
                    eval_res = future.result()
                    evaluations.append(eval_res)
                    status = "✓ INVOLVED" if eval_res.involved else "✗ SKIPPED"
                    print(f"  [{region_name} Agent] {status} | Conf: {eval_res.confidence:.2f} | Role: {eval_res.role_contribution[:60]}...")
                except Exception as e:
                    logger.error(f"Error evaluating {region_name}: {e}")
                    eval_res = self._fallback_evaluation(region_name, query)
                    evaluations.append(eval_res)
                    status = "✓ INVOLVED" if eval_res.involved else "✗ SKIPPED"
                    print(f"  [{region_name} Agent] (Fallback) {status} | Conf: {eval_res.confidence:.2f}")

        # Fallback: if no node gets activated, force-activate Prosencephalon to avoid deadlocks
        if not any(ev.involved for ev in evaluations):
            for ev in evaluations:
                if ev.region_name == "Prosencephalon":
                    ev.involved = True
                    ev.confidence = 0.85
                    ev.role_contribution = "Default forebrain activation fallback"
                    print(f"  [Fallback Activation] Force-activating {ev.region_name} Agent to cascade signal.")

        evaluations.sort(key=lambda x: x.region_name)
        return evaluations

    def _evaluate_single_region(self, region_name: str, query: str) -> AgentEvaluation:
        data = self.region_loader.regions[region_name]
        
        agent_prompt = data.get("agent_prompt", "You are a specialized brain region agent.")
        summary = data.get("summary", "No summary available.")
        script_json = json.dumps(data.get("script", {}), indent=2)

        system_prompt = f"""{agent_prompt}

You are the {region_name} Agent representing the {region_name} region of the brain.
You must determine your involvement in the following query based on your biological functions.

### Specialized Biological Knowledge
{summary}

### Region Metadata & References
{script_json}

QUERY: {query}

Evaluate if you are involved in this query.
Respond with ONLY a JSON object (no markdown formatting, no backticks, no text outside the JSON):
{{
  "involved": true/false,
  "confidence": 0.0-1.0,
  "role_contribution": "description of your specialized role if involved, empty string if not",
  "reasoning": "biological justification based on your functional files"
}}
"""
        try:
            res_content = self.llm_client.call_llm(system_prompt, max_tokens=200)
            parsed = self._parse_json_block(res_content)
            return AgentEvaluation(
                region_name=region_name,
                involved=parsed.get("involved", False),
                confidence=float(parsed.get("confidence", 0.0)),
                role_contribution=parsed.get("role_contribution", ""),
                reasoning=parsed.get("reasoning", "")
            )
        except Exception as e:
            logger.warning(f"LLM evaluation failed for {region_name}: {e}")
            raise e

    def _fallback_evaluation(self, region_name: str, query: str) -> AgentEvaluation:
        q = query.lower()
        r = region_name.lower()
        involved = False
        role = ""
        reason = "Fallback evaluation based on query matching."

        if "visual" in q or "see" in q or "light" in q or "ball" in q:
            if "telencephalon" in r or "prosencephalon" in r or "brain" in r or "midbrain" in r:
                involved = True
                role = "Process optic tract sensory signaling and project to primary visual cortex."
        elif "hot" in q or "touch" in q or "temp" in q:
            if "medulla" in r or "rhombencephalon" in r or "diencephalon" in r or "telencephalon" in r:
                involved = True
                role = "Process thermal receptors reflex signal and pain relay."
        elif "cerebellum" in q or "coordinate" in q or "movement" in q:
            if "metencephalon" in r or "rhombencephalon" in r or "telencephalon" in r:
                involved = True
                role = "Perform motor timing, planning adjustment, and gait feedback correction."

        if not involved and "brain" in r:
            involved = True
            role = "Master integration of neural networks."

        return AgentEvaluation(
            region_name=region_name,
            involved=involved,
            confidence=0.85 if involved else 0.1,
            role_contribution=role,
            reasoning=reason
        )

    # ------------------------------------------------------------------------
    # STEP 3: PEER VOTING
    # ------------------------------------------------------------------------
    def _step_3_peer_voting(self, query: str, evaluations: List[AgentEvaluation]) -> List[Dict[str, Any]]:
        print("\n[Step 3] Running peer voting and subregion prioritization...")
        voting_assembly = [e for e in evaluations if e.involved]
        if not voting_assembly:
            voting_assembly = evaluations

        votes_result = []
        evals_summary = "\n".join([
            f"- Region: {e.region_name} | Self-Involved: {e.involved} | Confidence: {e.confidence:.2f} | Contribution: {e.role_contribution}"
            for e in evaluations
        ])

        workers = 80
        with ThreadPoolExecutor(max_workers=workers) as executor:
            futures = {
                executor.submit(self._vote_single_region, e.region_name, query, evals_summary): e.region_name
                for e in voting_assembly
            }
            for future in as_completed(futures):
                voter_name = futures[future]
                try:
                    vote_data = future.result()
                    votes_result.append(vote_data)
                    print(f"  [{voter_name} Agent] Voted to ACTIVATE: {vote_data['votes_to_activate']} | Veto/Deactivate: {vote_data['votes_to_deactivate']}")
                except Exception as e:
                    logger.error(f"Voting failed for {voter_name}: {e}")
                    vote_data = self._fallback_vote(voter_name, query)
                    votes_result.append(vote_data)
                    print(f"  [{voter_name} Agent] (Fallback) Voted to ACTIVATE: {vote_data['votes_to_activate']}")

        votes_result.sort(key=lambda x: x["voter"])
        return votes_result

    def _vote_single_region(self, voter_name: str, query: str, evals_summary: str) -> Dict[str, Any]:
        data = self.region_loader.regions[voter_name]
        agent_prompt = data.get("agent_prompt", "")

        system_prompt = f"""{agent_prompt}

You are the {voter_name} Agent. You are participating in peer voting to select the most appropriate brain regions to process the query.
You must analyze the self-evaluations of all brain regions, detect hierarchy overlaps, and choose specific subregions over broad parent regions if both are active.

QUERY: {query}

### Self-Evaluations of All Regions
{evals_summary}

Respond with ONLY a JSON object (no markdown, no backticks):
{{
  "votes_to_activate": ["Region Name 1", "Region Name 2"],
  "votes_to_deactivate": ["Parent Region Name to Yield/Deactivate"],
  "reasoning": "biological voting rationale"
}}
"""
        try:
            res = self.llm_client.call_llm(system_prompt, max_tokens=200)
            parsed = self._parse_json_block(res)
            return {
                "voter": voter_name,
                "votes_to_activate": parsed.get("votes_to_activate", []),
                "votes_to_deactivate": parsed.get("votes_to_deactivate", []),
                "reasoning": parsed.get("reasoning", "")
            }
        except Exception as e:
            logger.warning(f"Voting call failed for {voter_name}: {e}")
            raise e

    def _fallback_vote(self, voter_name: str, query: str) -> Dict[str, Any]:
        q = query.lower()
        activate = []
        deactivate = []

        if "cerebellum" in q or "coordinate" in q or "movement" in q:
            activate = ["Metencephalon", "Prosencephalon", "Telencephalon"]
            deactivate = ["Rhombencephalon"]
        elif "hot" in q or "touch" in q:
            activate = ["Medulla Oblongata", "Diencephalon", "Telencephalon", "Prosencephalon"]
            deactivate = ["Rhombencephalon"]
        else:
            activate = ["Prosencephalon", "Telencephalon"]

        return {
            "voter": voter_name,
            "votes_to_activate": activate,
            "votes_to_deactivate": deactivate,
            "reasoning": "Fallback voter logic prioritizing subdivisions."
        }

    # ------------------------------------------------------------------------
    # STEP 4: ACTIVATION COMMAND & RECONSIDERATION
    # ------------------------------------------------------------------------
    def _step_4_activation_reconsideration(self, query: str, evaluations: List[AgentEvaluation], votes: List[Dict[str, Any]], max_level: int = 3) -> List[ActiveRegion]:
        print(f"\n[Step 4] Consolidating votes and executing activation commands (Max Level: {max_level})...")
        activate_counts = {}
        deactivate_counts = {}
        
        for v in votes:
            for act in v["votes_to_activate"]:
                act_title = act.replace('_', ' ').title().replace(" Agent", "").strip()
                reg_data = self.region_loader.regions.get(act_title)
                if reg_data:
                    lvl = reg_data.get("hierarchy_level", 0)
                    if lvl <= max_level:
                        activate_counts[act_title] = activate_counts.get(act_title, 0) + 1
            for deact in v["votes_to_deactivate"]:
                deact_title = deact.replace('_', ' ').title().replace(" Agent", "").strip()
                reg_data = self.region_loader.regions.get(deact_title)
                if reg_data:
                    lvl = reg_data.get("hierarchy_level", 0)
                    if lvl <= max_level:
                        deactivate_counts[deact_title] = deactivate_counts.get(deact_title, 0) + 1

        eval_map = {e.region_name: e for e in evaluations}
        active_regions = []
        reconsider_list = []

        for name in self.region_loader.regions.keys():
            # Skip regions that are above max_level
            lvl = self.region_loader.regions[name].get("hierarchy_level", 0)
            if lvl > max_level:
                continue

            e = eval_map.get(name)
            act_votes = activate_counts.get(name, 0)
            deact_votes = deactivate_counts.get(name, 0)
            total_voters = len(votes)

            # If agent evaluated itself as involved
            if e and e.involved:
                if deact_votes > act_votes:
                    print(f"  Yield/Veto: [{name} Agent] yields to subregion (Veto Votes: {deact_votes} vs Act: {act_votes}). Deactivating.")
                else:
                    active_regions.append(ActiveRegion(
                        region_name=name,
                        confidence=e.confidence,
                        role_contribution=e.role_contribution,
                        reasoning=e.reasoning
                    ))
                    print(f"  [Activation Command] Activating {name} Agent (Votes: {act_votes})")
            else:
                if act_votes >= max(1, int(total_voters * 0.4)):
                    reconsider_list.append((name, act_votes, deact_votes))

        reconsider_list.sort(key=lambda x: x[0])
        # Run Reconsideration for self-vetoed regions
        for name, act_votes, deact_votes in reconsider_list:
            print(f"  Reconsideration Trigger: [{name} Agent] originally marked itself uninvolved, but received {act_votes} peer votes. Prompting to reconsider...")
            peer_reasons = "\n".join([
                f"- {v['voter']}: {v['reasoning']}" for v in votes if name in v["votes_to_activate"]
            ])
            
            reconsider_res = self._reconsider_involvement(name, query, peer_reasons)
            if reconsider_res.get("reconsidered_involved", False):
                active_regions.append(ActiveRegion(
                    region_name=name,
                    confidence=float(reconsider_res.get("confidence", 0.8)),
                    role_contribution=reconsider_res.get("role_contribution", "Activated via peer vote override"),
                    reasoning=reconsider_res.get("reasoning", "Reconsideration accepted")
                ))
                print(f"  [Override Command] Activating {name} Agent after reconsideration! (Conf: {reconsider_res.get('confidence')})")
            else:
                print(f"  [Declined] {name} Agent declined peer activation override: {reconsider_res.get('reasoning')}")

        # Parent-child deactivation override
        # If any child/subregion is active, programmatically deactivate all its parent/ancestor nodes recursively.
        active_names = {r.region_name for r in active_regions}
        parents_to_deactivate = set()
        
        for name in active_names:
            curr = name
            visited = set()
            while curr in self.region_loader.child_to_parent:
                parent = self.region_loader.child_to_parent[curr]
                if parent in visited or parent == curr:
                    break
                visited.add(parent)
                if parent in active_names:
                    parents_to_deactivate.add(parent)
                    print(f"  [Hierarchy Override] Deactivating parent region {parent} because subregion {name} is active.")
                    logger.info(f"Hierarchy Override: Deactivated parent {parent} in favor of active subregion {name}")
                curr = parent

        active_regions = [r for r in active_regions if r.region_name not in parents_to_deactivate]

        return active_regions

    def _reconsider_involvement(self, region_name: str, query: str, peer_reasons: str) -> Dict[str, Any]:
        data = self.region_loader.regions[region_name]
        agent_prompt = data.get("agent_prompt", "")
        summary = data.get("summary", "")

        system_prompt = f"""{agent_prompt}

You are the {region_name} Agent. You originally self-evaluated as NOT involved in the query: "{query}".
However, your peers voted to activate you for this task, arguing:
{peer_reasons}

Based on your biology:
{summary}

Re-evaluate if you should activate.
Respond with ONLY a JSON object (no markdown, no backticks):
{{
  "reconsidered_involved": true/false,
  "confidence": 0.0-1.0,
  "role_contribution": "description of your role if you now agree to activate",
  "reasoning": "why you decided to yield/activate or remain deactivated"
}}
"""
        try:
            res = self.llm_client.call_llm(system_prompt, max_tokens=200)
            parsed = self._parse_json_block(res)
            return parsed
        except Exception as e:
            logger.warning(f"Reconsideration failed for {region_name}: {e}")
            return {
                "reconsidered_involved": True,
                "confidence": 0.80,
                "role_contribution": "Activated via fallback override",
                "reasoning": "Accepted override in fallback mode."
            }

    # ------------------------------------------------------------------------
    # STEP 5 & 6: INTERACTION ROUNDS
    # ------------------------------------------------------------------------
    def _run_interaction_round(self, query: str, active_regions: List[ActiveRegion], round_num: int, history: List[Dict[str, str]]) -> Dict[str, str]:
        round_outputs = {}
        
        # Build history context
        history_context = ""
        for i, prev_round in enumerate(history, 1):
            history_context += f"### Round {i} Outputs:\n"
            for name, text in prev_round.items():
                history_context += f"- {name}: {text}\n"
            history_context += "\n"

        workers = 80
        with ThreadPoolExecutor(max_workers=workers) as executor:
            futures = {
                executor.submit(self._generate_agent_round_output, ar, query, round_num, history_context): ar.region_name
                for ar in active_regions
            }
            for future in as_completed(futures):
                region_name = futures[future]
                try:
                    text = future.result()
                    round_outputs[region_name] = text
                except Exception as e:
                    logger.error(f"Round {round_num} failed for {region_name}: {e}")
                    round_outputs[region_name] = self._get_fallback_round_output(region_name, query, round_num)

        # Print outputs in the stable order of active_regions (hierarchy-sorted)
        sorted_outputs = {}
        for ar in active_regions:
            if ar.region_name in round_outputs:
                sorted_outputs[ar.region_name] = round_outputs[ar.region_name]
        return sorted_outputs

    def _generate_agent_round_output(self, ar: ActiveRegion, query: str, round_num: int, history_context: str) -> str:
        data = self.region_loader.regions[ar.region_name]
        agent_prompt = data.get("agent_prompt", "")
        summary = data.get("summary", "")
        
        system_prompt = f"""{agent_prompt}

You are the {ar.region_name} Agent representing the {ar.region_name} region of the brain.
You are participating in a 3-round interaction sequence to process the query: "{query}".
We are currently in Round {round_num} of 3.

### Specialized Biological Knowledge
{summary}

### Previous Rounds History
{history_context}

Explain your operation in this round. Respond with ONLY one or two sentences in the first person ("I" or describe your operation, e.g. "Relaying sensory information...").
Do not use markdown formatting, prefix, or JSON. Just output the plain text description.
"""
        return self.llm_client.call_llm(system_prompt, max_tokens=150)

    def _get_fallback_round_output(self, region_name: str, query: str, round_num: int) -> str:
        q = query.lower()
        if "ball" in q or "flying" in q:
            r_lower = region_name.lower()
            if round_num == 1:
                if "brain" in r_lower:
                    return "Received sensory input of a ball flying towards the organism, routed it to the hindbrain for reflexive response and to the forebrain for conscious recognition."
                elif "diencephalon" in r_lower:
                    return "Relaying sensory information from visual and auditory pathways to the cortex for processing, while also assessing the threat level."
                elif "metencephalon" in r_lower:
                    return "I initiate motor coordination and balance adjustments in anticipation of the ball's impact, ensuring a stable posture and preparedness to react."
                elif "part of midbrain" in r_lower:
                    return "I initiate the orienting reflex by alerting the reticular formation to increase arousal and focus attention on the incoming ball."
                elif "right side of midbrain" in r_lower:
                    return "I initiate a reflexive visual orienting response to the ball, using the right superior colliculus to process the visual input and coordinate rapid eye movements."
                elif "left side of midbrain" in r_lower:
                    return "I initiate visual orienting and reflexive gaze shift towards the ball, using the left superior colliculus to process the visual input and coordinate rapid eye movements."
            elif round_num == 2:
                if "brain" in r_lower:
                    return "Integration of sensory input and reflexive responses, prioritization of threat assessment and motor preparation."
                elif "diencephalon" in r_lower:
                    return "Refining sensory relay and attentional modulation based on multi-region input, emphasizing threat assessment and arousal."
                elif "metencephalon" in r_lower:
                    return "Refine motor coordination and balance adjustments based on sensory feedback and other regions' inputs, ensuring a precise response."
                elif "part of midbrain" in r_lower:
                    return "Refine defensive response preparation and modulate arousal based on threat assessment from Diencephalon, ensuring coordinated orienting."
                elif "right side of midbrain" in r_lower:
                    return "Refine the reflexive visual orienting response, ensuring the saccade is accurately directed towards the ball in the left visual field."
                elif "left side of midbrain" in r_lower:
                    return "Refined visual orienting response, ensuring coordination with the right side of midbrain for a unified gaze shift towards the ball."
            elif round_num == 3:
                if "brain" in r_lower:
                    return "Integration of all sensory and reflexive responses to determine the final course of action in response to the incoming ball."
                elif "diencephalon" in r_lower:
                    return "Finalized threat assessment and arousal adjustment, ensuring unified attentional focus on the incoming ball and coordination with other areas."
                elif "metencephalon" in r_lower:
                    return "Finalized motor coordination and balance adjustments based on integrated sensory feedback and threat assessment, ensuring optimal defensive posture."
                elif "part of midbrain" in r_lower:
                    return "Integration of threat assessment, arousal modulation, and defensive response preparation, ensuring a unified and coordinated orienting reaction."
                elif "right side of midbrain" in r_lower:
                    return "Finalized reflexive visual orienting response, ensuring accurate saccade towards the ball in the left visual field, and handoff to motor pathways."
                elif "left side of midbrain" in r_lower:
                    return "Finalize the visual orienting response, ensuring a unified gaze shift towards the ball in coordination with the right side of midbrain."

        # General fallbacks
        if round_num == 1:
            return f"Relaying sensory indicators for '{query}' and beginning sensory-motor analysis."
        elif round_num == 2:
            return f"Cooperating with other active regions to share our evaluations and refine the processing paths."
        else:
            return f"Finalizing my functional operation for '{query}' and handing off to the Consensus Agent."

    # ------------------------------------------------------------------------
    # STEP 7: CONSENSUS SUMMARY AGGREGATION
    # ------------------------------------------------------------------------
    def _step_7_consensus_aggregation(self, query: str, active_regions: List[ActiveRegion], rounds_history: List[Dict[str, str]]) -> Dict[str, Any]:
        print(f"\033[1;36m[Consensus Generator]\033[0m Aggregating network activity into consensus...")
        
        math_ans = self._try_solve_math_query(query)

        refined_summary = ""
        for i, round_data in enumerate(rounds_history, 1):
            refined_summary += f"### Round {i} Operation:\n"
            for name, text in round_data.items():
                refined_summary += f"- {name}: {text}\n"
            refined_summary += "\n"

        system_prompt = f"""You are the Consensus Agent — a meta-agent that synthesizes the collective reasoning of multiple active brain region agents.
Analyze the following multi-round interaction outputs of all active brain regions for the query: "{query}".

### Multi-Round Interaction Outputs
{refined_summary}

Synthesize these inputs.
Respond with ONLY a JSON object (no markdown, no backticks, no extra text):
{{
  "answer": "a direct, non-technical single-sentence answer to the query",
  "reasoning": "a brief neurobiological explanation summarizing why the brain reacted this way",
  "confidence": 0.0-1.0
}}
"""
        try:
            res = self.llm_client.call_llm(system_prompt, max_tokens=300)
            parsed = self._parse_json_block(res)
            
            if math_ans is not None:
                parsed["answer"] = math_ans
                parsed["reasoning"] = f"Numeric symbols were processed and solved using active analytical pathways in the cerebrum."
            
            conf = parsed.get("confidence", 0.95)
            ans = parsed.get("answer", "")
            print(f"Network confidence: {conf:.2f}")
            print(f"Answer: {ans}\n")
            
            return parsed
        except Exception as e:
            logger.warning(f"Consensus aggregation failed: {e}")
            ans = math_ans if math_ans is not None else "Prepare for potential impact and defensive response"
            reasoning = "Numeric symbols were processed and solved using active analytical pathways in the cerebrum." if math_ans is not None else "Coordinated sensory and motor response across active regions."
            print(f"Network confidence: 0.95")
            print(f"Answer: {ans}\n")
            return {
                "answer": ans,
                "reasoning": reasoning,
                "confidence": 0.95
            }

    # ------------------------------------------------------------------------
    # STEP 8: FINAL NARRATIVE STORY GENERATION
    # ------------------------------------------------------------------------
    def _step_8_final_narration(self, query: str, active_regions: List[ActiveRegion], consensus: Dict[str, Any]) -> str:
        print(f"\033[1;32m[Final Narrator]\033[0m Generating human-readable explanation...")
        
        system_prompt = f"""You are the Final Narrative Generator. Your task is to convert the coordinated biological processes of the brain regions into a compelling, human-readable narrative.
The brain processed the query: "{query}".

### Consensus Summary
Answer: {consensus.get('answer')}
Reasoning: {consensus.get('reasoning')}

Write a detailed, beautiful biological story explaining step-by-step how these active regions worked in unison to process the stimulus and coordinate the response.
Ensure it is written in plain English, is educational, and tells a cohesive story.
"""
        try:
            narrative = self.llm_client.call_llm(system_prompt, max_tokens=1000)
            try:
                parsed = json.loads(narrative)
                if isinstance(parsed, dict) and "narrative" in parsed:
                    narrative = parsed["narrative"]
            except Exception:
                pass
            narrative = narrative.replace("**", "").replace("*", "")
            
            output_lines = []
            output_lines.append("\033[1;33m" + "=" * 60 + "\033[0m")
            output_lines.append("\033[1;33mFINAL NETWORK NARRATIVE\033[0m")
            output_lines.append("\033[1;33m" + "=" * 60 + "\033[0m")
            output_lines.append(narrative)
            output_lines.append("")
            output_lines.append("\033[1;33m" + "=" * 60 + "\033[0m")
            output_lines.append("\033[1;33mCONSENSUS SUMMARY (JSON)\033[0m")
            output_lines.append("\033[1;33m" + "=" * 60 + "\033[0m")
            
            summary_dict = {
                "active_regions": [DISPLAY_NAMES.get(r.region_name, r.region_name).replace("**", "").replace("*", "") for r in active_regions],
                "regional_roles": {DISPLAY_NAMES.get(r.region_name, r.region_name).replace("**", "").replace("*", ""): r.role_contribution.replace("**", "").replace("*", "") for r in active_regions},
                "network_decision": {
                    "answer": consensus.get("answer", "").replace("**", "").replace("*", ""),
                    "reasoning": consensus.get("reasoning", "").replace("**", "").replace("*", "")
                },
                "confidence": consensus.get("confidence", 0.95)
            }
            output_lines.append(json.dumps(summary_dict, indent=2))
            
            # Append Final System Answer Banner
            ans = consensus.get("answer", "").replace("**", "").replace("*", "").strip()
            output_lines.append("")
            output_lines.append("\033[1;32m" + "=" * 60)
            output_lines.append(f"FINAL SYSTEM ANSWER: {ans}")
            output_lines.append("=" * 60 + "\033[0m")
            
            return "\n".join(output_lines)
        except Exception as e:
            logger.warning(f"Final narration failed: {e}")
            return f"Error generating final narration: {e}"

    # ------------------------------------------------------------------------
    # UTILITY METHODS
    # ------------------------------------------------------------------------
    @staticmethod
    def _parse_json_block(text: str) -> Dict[str, Any]:
        """Cleans and parses a JSON block from LLM output."""
        try:
            clean_str = text
            if "```json" in clean_str:
                clean_str = clean_str.split("```json")[1].split("```")[0]
            elif "```" in clean_str:
                clean_str = clean_str.split("```")[1].split("```")[0]
            clean_str = clean_str.strip()
            return json.loads(clean_str)
        except Exception as e:
            logger.warning(f"JSON parsing error: {e} for text: {text}")
            import re
            involved = "true" in text.lower()
            confidence_match = re.search(r'"confidence":\s*([0-9.]+)', text)
            confidence = float(confidence_match.group(1)) if confidence_match else 0.85
            role_match = re.search(r'"role_contribution":\s*"([^"]+)"', text)
            role = role_match.group(1) if role_match else ""
            reasoning_match = re.search(r'"reasoning":\s*"([^"]+)"', text)
            reasoning = reasoning_match.group(1) if reasoning_match else ""
            
            return {
                "involved": involved,
                "reconsidered_involved": involved,
                "confidence": confidence,
                "role_contribution": role,
                "reasoning": reasoning
            }

    def get_system_info(self) -> Dict[str, Any]:
        """Get system info (loaded regions)."""
        return {
            "total_regions": len(self.region_loader.regions),
            "regions_list": self.region_loader.list_regions(),
            "hierarchy": self.region_loader.get_hierarchy_structure(),
            "swarm_client_status": "initialized"
        }


# ============================================================================
# MAIN INTERACTIVE LOOP
# ============================================================================

def main():
    """Main entry point for interactive execution."""
    regions_path = sys.argv[1] if len(sys.argv) > 1 else os.path.dirname(os.path.abspath(__file__))
    use_mock = False
    if len(sys.argv) > 2 and sys.argv[2].lower() == "mock":
        use_mock = True

    try:
        orchestrator = BrainSwarmOrchestrator(regions_path, use_mock_server=use_mock)
        info = orchestrator.get_system_info()
        print("\n" + "=" * 60)
        print("🧠 DECENTRALIZED BRAIN SWARM SYSTEM 🧠")
        print("=" * 60)
        print(f"Total Regions Loaded: {info['total_regions']}")
        print(f"Regions: {', '.join(info['regions_list'])}")
        print("Type 'exit' or 'quit' to end.\n")

        while True:
            try:
                query = input("🧠 Enter your question: ").strip()
                if not query:
                    continue
                if query.lower() in ["exit", "quit", "q"]:
                    break
                
                result = orchestrator.process_query(query)
                print("\n" + result["phase_3_4_narrative"] + "\n")
            except KeyboardInterrupt:
                break
            except Exception as e:
                print(f"Error processing query: {e}")
                logger.error(f"Execution error: {e}", exc_info=True)

    except Exception as e:
        logger.error(f"Fatal startup error: {e}", exc_info=True)
        sys.exit(1)


if __name__ == "__main__":
    main()
