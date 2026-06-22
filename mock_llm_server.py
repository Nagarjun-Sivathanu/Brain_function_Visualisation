"""
Mock OpenAI-Compatible LLM Server
===================================
Simulates an OpenAI API-compatible LLM endpoint for local testing.
This allows testing the Swarm system without access to the real Llama server.
"""

import json
import time
from typing import Dict, List, Any, Optional
from dataclasses import dataclass
from datetime import datetime
import logging

try:
    from flask import Flask, request, jsonify
    from flask_cors import CORS
except ImportError:
    print("⚠️ Flask not installed. Run: pip install flask flask-cors")
    exit(1)

# ============================================================================
# LOGGING
# ============================================================================

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# ============================================================================
# MOCK LLM RESPONSES
# ============================================================================

class MockLLMResponses:
    """Provides realistic mock responses for testing."""

    INVOLVEMENT_RESPONSES = [
        {
            "involved": True,
            "confidence": 0.85,
            "role_contribution": "Primary sensory processing and integration",
            "reasoning": "This region is directly involved in the requested function"
        },
        {
            "involved": True,
            "confidence": 0.70,
            "role_contribution": "Secondary coordination and modulation",
            "reasoning": "This region provides supporting functions"
        },
        {
            "involved": False,
            "confidence": 0.05,
            "role_contribution": "",
            "reasoning": "This region is not directly involved in this process"
        },
    ]

    BRAIN_REGIONS_KNOWLEDGE = {
        "Brain": {
            "involved": True,
            "confidence": 0.75,
            "role_contribution": "Master integration and coordination of all neural processing",
            "reasoning": "The Brain region coordinates all neural activity"
        },
        "Rhombencephalon": {
            "involved": True,
            "confidence": 0.60,
            "role_contribution": "Autonomic regulation, balance, and reflexive responses",
            "reasoning": "Involved in basic homeostatic and reflexive functions"
        },
        "Prosencephalon": {
            "involved": True,
            "confidence": 0.55,
            "role_contribution": "Higher cognition, sensory integration, and motor planning",
            "reasoning": "Integrates sensory information and plans complex behaviors"
        },
        "Midbrain": {
            "involved": True,
            "confidence": 0.50,
            "role_contribution": "Attention, reflexive eye movements, and motor relay",
            "reasoning": "Coordinates attention and sensory-motor integration"
        },
    }

    @staticmethod
    def get_region_response(region_name: str, query: str) -> Dict[str, Any]:
        """Get a mock response for a region's involvement in a query."""
        q_lower = query.lower()

        # If the query is about a ball flying, return the exact active set from the user's screenshot
        if "ball" in q_lower or "flying" in q_lower:
            active_set = {
                "brain", "prosencephalon", "midbrain", "rhombencephalon", 
                "diencephalon", "telencephalon", "metencephalon", 
                "part of midbrain", "right side of midbrain", "left side of midbrain"
            }
            # Normalize region name
            norm_name = region_name.lower().replace("_", " ").strip()
            is_active = norm_name in active_set
            
            # Extract roles matching the third screenshot
            roles = {
                "brain": "Central integrative controller, evaluating and responding to sensory input",
                "prosencephalon": "Conscious perception, voluntary action, and cognition",
                "midbrain": "Visual orienting, eye movement control, and motor modulation",
                "rhombencephalon": "Motor coordination, balance, and protective reflexes",
                "diencephalon": "Sensory relay, attention gating, and arousal modulation",
                "telencephalon": "Conscious perception, voluntary motor planning, and spatial awareness",
                "metencephalon": "Motor coordination, balance and posture maintenance, and cranial nerve functions",
                "part of midbrain": "Orienting reflexes, arousal modulation, and defensive response",
                "right side of midbrain": "Reflexive visual orienting and eye movement control for the left visual field",
                "left side of midbrain": "Reflexive visual orienting and eye movement control for the right visual field"
            }
            
            role = roles.get(norm_name, "Specialized functional processing") if is_active else ""
            
            return {
                "involved": is_active,
                "confidence": 0.95 if is_active else 0.05,
                "role_contribution": role,
                "reasoning": "Determined by proximity and sensory-motor involvement."
            }

        # Otherwise, check specific knowledge
        if region_name in MockLLMResponses.BRAIN_REGIONS_KNOWLEDGE:
            base_response = MockLLMResponses.BRAIN_REGIONS_KNOWLEDGE[region_name].copy()
            if any(keyword in query.lower() for keyword in ["see", "visual", "light", "sight"]):
                if "visual" in region_name.lower() or "cortex" in region_name.lower():
                    base_response["confidence"] = min(0.95, base_response["confidence"] + 0.1)
                else:
                    base_response["confidence"] = max(0.1, base_response["confidence"] - 0.2)
            return base_response

        # Otherwise, return a random response
        response = MockLLMResponses.INVOLVEMENT_RESPONSES[
            hash((region_name, query)) % len(MockLLMResponses.INVOLVEMENT_RESPONSES)
        ]
        return response.copy()


# ============================================================================
# FLASK APP
# ============================================================================

app = Flask(__name__)
CORS(app)

app.config['JSON_SORT_KEYS'] = False


@app.route('/v1/chat/completions', methods=['POST'])
def chat_completions():
    try:
        data = request.json
        if not data:
            return jsonify({"error": "No JSON data provided"}), 400

        model = data.get('model', 'llama-3.3-70b')
        messages = data.get('messages', [])
        temperature = data.get('temperature', 0.7)
        max_tokens = data.get('max_tokens', 500)
        top_p = data.get('top_p', 0.9)

        if not messages:
            return jsonify({"error": "No messages provided"}), 400

        user_message = None
        system_message = None
        
        for msg in messages:
            if msg.get('role') == 'user':
                user_message = msg.get('content', '')
            elif msg.get('role') == 'system':
                system_message = msg.get('content', '')

        logger.info(f"📨 Received request | Model: {model} | Messages: {len(messages)}")

        response_content = _generate_mock_response(user_message, system_message)
        logger.info(f"✓ Generated mock response ({len(response_content)} chars)")

        response = {
            "id": f"chatcmpl-{int(time.time() * 1000000) % 1000000}",
            "object": "chat.completion",
            "created": int(time.time()),
            "model": model,
            "choices": [
                {
                    "index": 0,
                    "message": {
                        "role": "assistant",
                        "content": response_content
                    },
                    "finish_reason": "stop"
                }
            ],
            "usage": {
                "prompt_tokens": len(user_message.split()) if user_message else 0,
                "completion_tokens": len(response_content.split()),
                "total_tokens": len((user_message or "").split()) + len(response_content.split())
            }
        }

        return jsonify(response), 200

    except Exception as e:
        logger.error(f"Error processing request: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500


@app.route('/v1/models', methods=['GET'])
def list_models():
    return jsonify({
        "object": "list",
        "data": [
            {
                "id": "llama-3.3-70b",
                "object": "model",
                "owned_by": "mock",
                "permission": []
            }
        ]
    }), 200


@app.route('/health', methods=['GET'])
def health_check():
    return jsonify({
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "service": "Mock LLM Server"
    }), 200


# ============================================================================
# MOCK RESPONSE GENERATION
# ============================================================================

def _generate_mock_response(user_message: str, system_message: str = None) -> str:
    msg_lower = (user_message or "").lower()
    sys_lower = (system_message or "").lower()

    # Step 7 & 8: Consensus Narrative
    if "consensus agent" in sys_lower or "final narrative" in sys_lower or "consensus" in msg_lower or "active brain regions" in msg_lower:
        return _generate_consensus_narrative_response_from_system_message(system_message or user_message)

    # Step 3: Peer Voting
    if "vote on which of the other regions" in sys_lower or "vote" in sys_lower or "voting" in sys_lower:
        return _generate_voting_response(user_message, system_message)

    # Step 4: Reconsideration
    if "reconsider" in sys_lower or "veto override" in sys_lower or "reconsideration" in sys_lower:
        return _generate_reconsideration_response(user_message, system_message)

    # Step 5 & 6: 3 Rounds of Interaction
    if "round 1" in sys_lower:
        return _generate_round_response(user_message, system_message, 1)
    if "round 2" in sys_lower:
        return _generate_round_response(user_message, system_message, 2)
    if "round 3" in sys_lower:
        return _generate_round_response(user_message, system_message, 3)

    # Step 2: Self-Evaluation
    if "determine your involvement" in sys_lower or ("involved" in msg_lower and "{" in msg_lower):
        return _generate_involvement_evaluation(user_message, system_message)

    return "Based on the query, this involves complex neural processing across multiple brain regions."


def _generate_round_response(user_message: str, system_message: str, round_num: int) -> str:
    import re
    combined = (system_message or "") + "\n" + (user_message or "")
    
    # Extract region name
    match = re.search(r"You are the (.+?) Agent", combined, re.IGNORECASE)
    region_name = match.group(1).strip() if match else "Unknown"
    region_name = region_name.replace("Agent", "").strip()
    r_lower = region_name.lower()

    # Extract query
    query = ""
    query_match = re.search(r'query:\s*"([^"]+)"', combined, re.IGNORECASE)
    if query_match:
        query = query_match.group(1)
    
    q_lower = query.lower()

    # Exact screenshot responses for the ball flying query
    if "ball" in q_lower or "flying" in q_lower:
        if round_num == 1:
            if "brain" in r_lower:
                return "Received sensory input of a ball flying towards the organism, routed it to the hindbrain for reflexive response and to the forebrain for conscious recognition."
            elif "diencephalon" in r_lower:
                return "Relaying sensory information from visual and auditory pathways to the cortex for processing, while also assessing the saliency of the stimulus."
            elif "metencephalon" in r_lower:
                return "I initiate motor coordination and balance adjustments in anticipation of the ball's impact, ensuring a stable posture and preparedness."
            elif "part of midbrain" in r_lower:
                return "I initiate the orienting reflex by alerting the reticular formation to increase arousal and focus attention on the incoming stimulus."
            elif "right side of midbrain" in r_lower:
                return "I initiate a reflexive visual orienting response to the ball, using the right superior colliculus to process the visual input."
            elif "left side of midbrain" in r_lower:
                return "I initiate visual orienting and reflexive gaze shift towards the ball, using the left superior colliculus to process the visual input."
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

    # General mock fallbacks for other queries
    if round_num == 1:
        return f"I am the {region_name} Agent. I receive neural signals for '{query}' and begin sensory-motor analysis."
    elif round_num == 2:
        return f"I am the {region_name} Agent. I cooperate with peer regions to share our evaluations and refine the processing paths."
    else:
        return f"I am the {region_name} Agent. I finalize my functional contribution for '{query}' and prepare to hand off to the Consensus Agent."


def _generate_voting_response(user_message: str, system_message: str) -> str:
    import re
    combined = (system_message or "") + "\n" + (user_message or "")
    
    # Extract region name
    match = re.search(r"You are the (.+?) Agent", combined, re.IGNORECASE)
    region_name = match.group(1).strip() if match else "Unknown"

    # Extract query
    query = ""
    query_match = re.search(r'query:\s*"([^"]+)"', combined, re.IGNORECASE)
    if not query_match:
        query_match = re.search(r'prompt given to the brain is:\s*"([^"]+)"', combined, re.IGNORECASE)
    if query_match:
        query = query_match.group(1)

    q = query.lower()
    votes_to_activate = []
    votes_to_deactivate = []

    if "ball" in q or "flying" in q:
        votes_to_activate = [
            "Brain",
            "Prosencephalon",
            "Midbrain",
            "Rhombencephalon",
            "Diencephalon",
            "Telencephalon",
            "Metencephalon",
            "Part Of Midbrain",
            "Right Side Of Midbrain",
            "Left Side Of Midbrain"
        ]
        votes_to_deactivate = []
    elif "cerebellum" in q or "coordinate" in q or "movement" in q:
        votes_to_activate = ["Metencephalon", "Prosencephalon", "Telencephalon"]
        votes_to_deactivate = ["Rhombencephalon"]
    elif "hot" in q or "touch" in q:
        votes_to_activate = ["Medulla Oblongata", "Diencephalon", "Telencephalon", "Prosencephalon"]
        votes_to_deactivate = ["Rhombencephalon"]
    else:
        votes_to_activate = ["Prosencephalon", "Telencephalon"]

    return json.dumps({
        "votes_to_activate": votes_to_activate,
        "votes_to_deactivate": votes_to_deactivate,
        "reasoning": f"As the {region_name} Agent, I vote to prioritize specific active subdivisions and deactivate general parents."
    })


def _generate_reconsideration_response(user_message: str, system_message: str) -> str:
    import re
    combined = (system_message or "") + "\n" + (user_message or "")
    match = re.search(r"You are the (.+?) Agent", combined, re.IGNORECASE)
    region_name = match.group(1).strip() if match else "Unknown"

    return json.dumps({
        "reconsidered_involved": True,
        "confidence": 0.80,
        "role_contribution": f"Supporting role for processing stimulus, activated via peer voting",
        "reasoning": f"Although {region_name} originally opted to skip, peer agents have voted that this region is essential for this neural pathway. I yield and activate."
    })


def _generate_direct_consensus_answer(query: str) -> Dict[str, Any]:
    q = query.lower().strip()
    
    # Check for ball/flying query first to return exact narrative from user's second screenshot
    if "ball" in q or "flying" in q:
        answer = "Prepare for potential impact and defensive response"
        narrative = (
            "Here's what's happening in your brain as the ball comes flying towards you:\n\n"
            "As the ball approaches, your entire brain springs into action, working together to help you respond to the situation. "
            "The forebrain, responsible for conscious perception and voluntary action, quickly processes the visual information and recognizes the potential threat. "
            "The midbrain, which controls eye movement and visual orienting, rapidly focuses your attention on the ball, tracking its movement and speed.\n\n"
            "Meanwhile, the hindbrain, which regulates motor coordination and balance, prepares your body for a potential impact. "
            "It readies your muscles to react, whether it's to dodge, catch, or protect yourself from the ball. "
            "The diencephalon, acting as a relay station for sensory information, helps to filter out distractions and focus your attention on the ball.\n\n"
            "The cerebrum, responsible for conscious perception and spatial awareness, helps you to understand the trajectory of the ball and anticipate its path. "
            "The metencephalon, which coordinates motor movements and maintains balance, fine-tunes your posture and prepares your body to respond to the incoming ball.\n\n"
            "As the ball approaches, the right and left sides of the midbrain work together to control your eye movements, tracking the ball's movement and adjusting your focus accordingly. "
            "The part of the midbrain responsible for orienting reflexes and defensive responses is also activated, preparing your body for a potential impact.\n\n"
            "After integrating all this information, your brain reaches a consensus: prepare for potential impact and defensive response. "
            "With a high degree of confidence (95%), your brain has assessed the threat level as moderate to high and coordinated a unified response to help you address the incoming ball. "
            "This response involves motor preparation, visual focus, and arousal adjustment, all working together to help you react quickly and effectively to the situation."
        )
        reasoning = (
            "The network has integrated sensory input from multiple regions, assessed the threat level as moderate to high, "
            "and coordinated a unified response involving motor preparation, visual focus, and arousal adjustment to address the incoming ball."
        )
    elif "hot" in q or "touch" in q:
        answer = "You feel the heat and reflexively pull your hand away."
        narrative = "Touching a hot surface triggers a rapid reflex arc in the hindbrain and spinal pathway, while the sensory signals route through the forebrain for conscious perception of pain and coordination of hand withdrawal."
        reasoning = "Sensory thermal receptors trigger rapid motor withdrawal reflexes in the brainstem before conscious pain perception is fully registered."
    elif "pen" in q.split() or " pen " in f" {q} ":
        answer = "The object in front of you is a pen."
        narrative = "As you see a pen, your brain instantly processes the visual stimulus. The forebrain performs higher cognition and conscious recognition of the object, while the midbrain routes sensory information and the hindbrain prepares your body to interact or focus."
        reasoning = "Visual input is relayed through the optic pathway, processed in the cortex, and coordinated with attention networks."
    elif "lift" in q or "weight" in q:
        answer = "You are lifting the weight."
        narrative = "Lifting the weight requires motor planning in the forebrain, motor fine-tuning and balance coordination in the hindbrain, and autonomic cardiovascular adjustment from the brainstem to supply muscles."
        reasoning = "Motor command propagation to somatic muscles is coordinated with autonomic pathways to adjust blood pressure and heart rate."
    elif "visual" in q or "see" in q:
        answer = "The visual stimulus is processed and recognized."
        narrative = "Light signals are received, processed by the thalamus, and projected to the visual cortex for shape, color, and depth perception, integrating with higher memory areas."
        reasoning = "Retinal projections propagate through thalamic relays to the primary visual areas for conscious object recognition."
    elif "cerebellum" in q or "coordinate" in q:
        answer = "Your movements are coordinated smoothly."
        narrative = "The hindbrain fine-tunes motor execution signals received from the forebrain, correcting errors in real-time based on sensory feedback to ensure balance and control."
        reasoning = "Motor planning from the cerebral cortex is modulated by cerebellar feedback loop to produce smooth voluntary movement."
    else:
        if q.startswith("i am "):
            verb_part = query[5:].strip()
            answer = f"You are {verb_part}."
        elif q.startswith("i "):
            verb_part = query[2:].strip()
            answer = f"You {verb_part}."
        else:
            answer = f"The brain has processed your query: {query}"
        narrative = f"The active brain regions worked in unison to process the query: '{query}'."
        reasoning = "Coordinated activity across the functional network produced a unified cognitive and physiological response."

    return {
        "answer": answer,
        "narrative": narrative,
        "reasoning": reasoning,
        "confidence": 0.95
    }


def _generate_consensus_narrative_response_from_system_message(system_message: str) -> str:
    import re
    query_match = re.search(r'query:\s*"([^"]+)"', system_message, re.IGNORECASE)
    if not query_match:
        query_match = re.search(r'situation:\s*"([^"]+)"', system_message, re.IGNORECASE)
    query = query_match.group(1) if query_match else "neural processing"
    
    return json.dumps(_generate_direct_consensus_answer(query))


def _generate_consensus_narrative_response(message: str) -> str:
    import re
    query_match = re.search(r"QUERY:\s*(.+?)(?:\n|$)", message)
    query = query_match.group(1) if query_match else "neural processing"
    
    return json.dumps(_generate_direct_consensus_answer(query))


def _generate_involvement_evaluation(message: str, system_message: str = None) -> str:
    import re
    combined = (system_message or "") + "\n" + (message or "")
    
    # Try finding "Your Region: ..." first
    region_match = re.search(r"Your Region:\s*([^\n]+)", combined, re.IGNORECASE)
    if region_match:
        region_name = region_match.group(1).strip()
    else:
        # Fall back to "You are the {region_name} Agent"
        region_match = re.search(r"You are the ([^\n]+?) Agent", combined, re.IGNORECASE)
        region_name = region_match.group(1).strip() if region_match else "Unknown Region"
        
    region_name = region_name.replace("**", "").replace("*", "").strip()

    query_match = re.search(r"QUERY:\s*([^\n]+)", combined, re.IGNORECASE)
    query = query_match.group(1).strip() if query_match else ""

    response = MockLLMResponses.get_region_response(region_name, query)
    return json.dumps(response)


# ============================================================================
# MAIN
# ============================================================================

def main():
    logger.info("=" * 70)
    logger.info("MOCK LLM SERVER - STARTING")
    logger.info("=" * 70)
    logger.info("🚀 Starting Flask app...")
    logger.info("📍 Server running on http://localhost:8000")
    logger.info("📍 Health check: http://localhost:8000/health")
    logger.info("📍 Chat endpoint: POST http://localhost:8000/v1/chat/completions")
    logger.info("")
    logger.info("Press Ctrl+C to stop the server")
    logger.info("=" * 70 + "\n")

    app.run(
        host='127.0.0.1',
        port=8000,
        debug=False,
        threaded=True
    )


if __name__ == '__main__':
    main()
