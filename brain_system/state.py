from typing import TypedDict


class BrainState(TypedDict):
    query: str
    region_votes: dict          # {region_name: RegionVoteOutput dict}
    active_regions: list        # region names that passed threshold
    interaction_messages: list  # {round, region, content} entries
    consensus: dict             # aggregated consensus object
    final_answer: str           # human-readable narrative
