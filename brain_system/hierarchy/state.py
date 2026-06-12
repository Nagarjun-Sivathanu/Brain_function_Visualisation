from typing import TypedDict


class HierState(TypedDict):
    query: str
    routing_path: list        # [{parent, child, confidence, reason, level}] edges traversed
    activated_regions: list   # [{name, path, confidence}] deepest relevant regions
    region_reports: dict      # {region_name: report dict}
    debate_messages: list     # refinement round outputs
    cross_connections: dict   # {region_name: [connected regions]}
    consensus: dict           # aggregated consensus
    final_answer: str         # human-readable narrative
