from brain_system.state import BrainState
from brain_system.config import REGION_REGISTRY


def broadcast_node(state: BrainState) -> BrainState:
    region_count = len(REGION_REGISTRY)
    print(f"\n[Broadcast] Query received. Broadcasting to {region_count} region agents...")
    print(f"  Query: {state['query']}\n")
    return state
