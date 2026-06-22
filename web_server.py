import os
import sys
import logging
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS

# Add workspace directory to python path to import the orchestrator
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from brain_swarm_system import BrainSwarmOrchestrator

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

app = Flask(__name__, static_folder='static', static_url_path='')
CORS(app)

# Initialize both orchestrators
REGIONS_PATH = os.path.dirname(os.path.abspath(__file__))
logger.info("Initializing BrainSwarmOrchestrators...")
mock_orchestrator = BrainSwarmOrchestrator(REGIONS_PATH, use_mock_server=False)
real_orchestrator = BrainSwarmOrchestrator(REGIONS_PATH, use_mock_server=False)
logger.info("✓ Orchestrators successfully initialized!")

@app.route('/')
def serve_index():
    return send_from_directory(app.static_folder, 'index.html')

@app.route('/api/query', methods=['POST'])
def api_query():
    try:
        data = request.json
        if not data:
            return jsonify({"error": "No JSON payload provided"}), 400
            
        query = data.get("query", "").strip()
        mode = data.get("mode", "mock").lower()
        stream = data.get("stream", False)
        
        try:
            max_level = int(data.get("max_level", 3))
        except (ValueError, TypeError):
            max_level = 3
        max_level = max(3, min(5, max_level))
        
        if not query:
            return jsonify({"error": "Query parameter is required"}), 400
            
        logger.info(f"Received query request: '{query}' | Mode: {mode.upper()} | Stream: {stream} | Max Level: {max_level}")
        
        # Select orchestrator based on mode
        orchestrator = real_orchestrator if mode == "real" else mock_orchestrator
        
        if stream:
            from flask import Response
            def generate():
                for chunk in orchestrator.process_query_stream(query, max_level=max_level):
                    yield chunk
            return Response(generate(), mimetype='application/x-ndjson')
        else:
            result = orchestrator.process_query(query, max_level=max_level)
            return jsonify(result), 200
        
    except Exception as e:
        logger.error(f"Error handling visual query: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500

def main():
    import webbrowser
    import threading

    # Make sure static directory exists
    os.makedirs(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'static'), exist_ok=True)
    
    port = 5000
    logger.info("=" * 70)
    logger.info("🧠 BRAIN SWARM SYSTEM - INTERACTIVE DASHBOARD WEB SERVER 🧠")
    logger.info("=" * 70)
    logger.info(f"🚀 Dashboard running on: http://localhost:{port}")
    logger.info("📍 API Endpoint: POST http://localhost:5000/api/query")
    logger.info("=" * 70)
    
    # Auto-open browser after 1.5 seconds when Flask is ready
    def open_browser():
        logger.info("Opening dashboard in default web browser...")
        webbrowser.open(f"http://localhost:{port}")

    threading.Timer(1.5, open_browser).start()
    
    app.run(host='127.0.0.1', port=port, debug=False, threaded=True)

if __name__ == '__main__':
    main()
