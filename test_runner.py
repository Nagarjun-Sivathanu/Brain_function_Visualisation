"""
Test Runner for Brain Swarm System
===================================
Tests the complete Swarm system with the mock LLM server.

This script:
1. Starts the mock LLM server in a background thread
2. Runs the Brain Swarm orchestrator with test queries
3. Collects and displays results
4. Saves detailed logs

Usage:
    python test_runner.py
"""

import os
import sys
import time
import json
import subprocess
import threading
import logging
from pathlib import Path
from typing import Dict, Any, List
import requests

# ============================================================================
# LOGGING SETUP
# ============================================================================

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# ============================================================================
# CONSTANTS
# ============================================================================

MOCK_SERVER_URL = "http://localhost:8000"
REGIONS_PATH = os.path.dirname(os.path.abspath(__file__))
TEST_CASES = [
    {"query": "How does the brain process visual information?", "max_level": 3},
    {"query": "What happens when I touch something hot?", "max_level": 4},
    {"query": "How does the cerebellum coordinate movement?", "max_level": 5},
]

# ============================================================================
# MOCK SERVER HEALTH CHECK
# ============================================================================

def wait_for_server(url: str = MOCK_SERVER_URL, timeout: int = 30) -> bool:
    """Wait for the mock server to be ready."""
    start_time = time.time()
    
    while time.time() - start_time < timeout:
        try:
            response = requests.get(f"{url}/health", timeout=2)
            if response.status_code == 200:
                logger.info(f"✓ Server is ready: {url}")
                return True
        except requests.exceptions.ConnectionError:
            logger.info("⏳ Waiting for server to start...")
            time.sleep(1)
    
    logger.error(f"✗ Server did not start within {timeout} seconds")
    return False


# ============================================================================
# TEST EXECUTION
# ============================================================================

def run_test_suite(use_mock: bool = True) -> Dict[str, Any]:
    """Run the complete test suite."""
    
    logger.info("=" * 70)
    logger.info("BRAIN SWARM SYSTEM - TEST SUITE")
    logger.info("=" * 70)
    logger.info(f"Regions Path: {REGIONS_PATH}")
    if use_mock:
        logger.info(f"Mock Server URL: {MOCK_SERVER_URL}")
    else:
        logger.info("Server: Real Live Cluster (dgx5.humanbrain.in:8999)")
    logger.info(f"Test Cases: {len(TEST_CASES)}")
    logger.info("")

    # Import the orchestrator
    sys.path.insert(0, REGIONS_PATH)
    try:
        from brain_swarm_system import BrainSwarmOrchestrator
    except ImportError as e:
        logger.error(f"Failed to import BrainSwarmOrchestrator: {e}")
        return {"error": "Import failed"}

    # Initialize orchestrator
    try:
        orchestrator = BrainSwarmOrchestrator(REGIONS_PATH, use_mock_server=use_mock)
        logger.info("✓ Orchestrator initialized")
        logger.info("")
    except Exception as e:
        logger.error(f"Failed to initialize orchestrator: {e}")
        return {"error": f"Initialization failed: {e}"}

    # Get system info
    system_info = orchestrator.get_system_info()
    logger.info("System Info:")
    logger.info(f"  Total Regions: {system_info['total_regions']}")
    logger.info(f"  Regions: {', '.join(system_info['regions_list'])}")
    logger.info("")

    # Run test queries
    results = {
        "system_info": system_info,
        "test_results": [],
        "summary": {
            "total_queries": len(TEST_CASES),
            "successful": 0,
            "failed": 0,
        }
    }

    for i, tc in enumerate(TEST_CASES, 1):
        query = tc["query"]
        max_lvl = tc["max_level"]
        logger.info(f"\n{'=' * 70}")
        logger.info(f"TEST QUERY {i}/{len(TEST_CASES)}")
        logger.info(f"{'=' * 70}")
        logger.info(f"Query: {query} (Max Level: {max_lvl})\n")

        try:
            # Process query
            result = orchestrator.process_query(query, max_level=max_lvl)
            
            # Extract key metrics
            active_count = result.get('active_regions_count', 0)
            total_evals = len(result.get('phase_1_evaluations', []))
            
            logger.info(f"\n✓ Query processed successfully")
            logger.info(f"  Total Regions Evaluated: {total_evals}")
            logger.info(f"  Active Regions: {active_count}")
            logger.info(f"  Involvement Rate: {(active_count/total_evals*100):.1f}%")
            
            # Display narrative preview
            narrative = result.get('phase_3_4_narrative', '')
            narrative_preview = narrative[:300] + "..." if len(narrative) > 300 else narrative
            logger.info(f"\n📝 Narrative Preview:\n{narrative_preview}\n")

            # Store result
            results["test_results"].append({
                "query": query,
                "status": "success",
                "active_regions_count": active_count,
                "total_evaluations": total_evals,
                "narrative_length": len(narrative)
            })
            results["summary"]["successful"] += 1

        except Exception as e:
            logger.error(f"✗ Error processing query: {e}")
            results["test_results"].append({
                "query": query,
                "status": "failed",
                "error": str(e)
            })
            results["summary"]["failed"] += 1

    # Final summary
    logger.info("\n" + "=" * 70)
    logger.info("TEST SUMMARY")
    logger.info("=" * 70)
    logger.info(f"Total Queries: {results['summary']['total_queries']}")
    logger.info(f"Successful: {results['summary']['successful']}")
    logger.info(f"Failed: {results['summary']['failed']}")
    logger.info(f"Success Rate: {(results['summary']['successful']/results['summary']['total_queries']*100):.1f}%")

    return results


# ============================================================================
# RESULTS SAVING
# ============================================================================

def save_results(results: Dict[str, Any]) -> str:
    """Save test results to file."""
    output_file = Path(REGIONS_PATH) / "test_results.json"
    
    try:
        with open(output_file, 'w') as f:
            json.dump(results, f, indent=2)
        logger.info(f"\n✓ Results saved to {output_file}")
        return str(output_file)
    except Exception as e:
        logger.error(f"Failed to save results: {e}")
        return ""


# ============================================================================
# MAIN
# ============================================================================

def main():
    """Main entry point for the test runner."""
    import sys
    
    use_mock = True
    if len(sys.argv) > 1 and sys.argv[1].lower() in ["real", "--real", "false"]:
        use_mock = False

    print("\n" + "=" * 70)
    print("BRAIN SWARM SYSTEM - TEST RUNNER")
    print("=" * 70)
    print(f"Mode: {'MOCK' if use_mock else 'REAL LIVE CLUSTER'}")
    print("\nThis test runner will:")
    if use_mock:
        print("1. Verify the mock LLM server is running")
    else:
        print("1. Verify connectivity to the real Llama cluster")
    print("2. Initialize the Swarm orchestrator")
    print("3. Process test queries through all 4 phases")
    print("4. Save detailed results")
    print("\n" + "=" * 70 + "\n")

    if use_mock:
        # Check if mock server is available
        logger.info("🔍 Checking mock LLM server...")
        if not wait_for_server():
            logger.error("✗ Mock server is not running!")
            logger.info("\nTo start the mock server, run in a separate terminal:")
            logger.info("  python mock_llm_server.py")
            return
    else:
        # Check if real server is available
        logger.info("🔍 Checking connectivity to real server (dgx5.humanbrain.in:8999)...")
        import socket
        try:
            s = socket.socket()
            s.settimeout(3.0)
            s.connect(('dgx5.humanbrain.in', 8999))
            s.close()
            logger.info("✓ Connected to real server successfully!")
        except Exception as e:
            logger.error(f"✗ Cannot connect to real server: {e}")
            return

    # Run tests
    try:
        results = run_test_suite(use_mock=use_mock)
        
        # Save results
        output_file = save_results(results)
        
        # Display final status
        logger.info("\n" + "=" * 70)
        logger.info("✓ TEST SUITE COMPLETED SUCCESSFULLY")
        logger.info("=" * 70)
        
        if output_file:
            logger.info(f"\n📊 Full results: {output_file}")
            logger.info("\nTo review the results, open the JSON file or run:")
            logger.info(f"  python -m json.tool {output_file}")

    except KeyboardInterrupt:
        logger.info("\n\n⏸️  Test suite interrupted by user")
    except Exception as e:
        logger.error(f"\n✗ Fatal error during test: {e}", exc_info=True)


if __name__ == "__main__":
    main()
