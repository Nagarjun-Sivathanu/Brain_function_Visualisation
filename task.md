# Tasks

- `[x]` Implement `process_query_stream` in `brain_swarm_system.py`
- `[x]` Support stream mode in `web_server.py`
- `[x]` Update `static/index.js` to clear input immediately, show query, and stream NDJSON
- `[x]` Debug and inspect `static/index.html` for layout/rendering issues
- `[x]` Test streaming functionality with Mock & Real modes
- `[x]` Verify everything using test suite
- `[x]` Recover project frontend and server files from conversation transcript logs
- `[x]` Fix python environment corruption issues in `.venv` (typing-extensions, pydantic-core, pydantic, click, colorama, charset-normalizer, openai, jiter)
- `[x]` Fix syntax error in `brain_swarm_system.py` (parenthesized get_region arguments)
- `[x]` Wrap switch-case blocks in `static/index.js` to avoid duplicate block-scoped variable declaration syntax errors
- `[x]` Auto-open dashboard in the default browser on web server start using `webbrowser` background timer
- `[x]` Change hardcoded Downloads path to dynamic path in `web_server.py` and `test_runner.py`
- `[x]` Fix hardcoded Downloads path in `brain_swarm_system.py` CLI main fallback
- `[x]` Re-inject missing `process_query_stream` method into `brain_swarm_system.py`
- `[x]` Add robust exponential backoff retries and 90-second timeout for LLM client to prevent "Connection error" bugs
- `[x]` Create a standalone `.bat` file (`start_web_app.bat`) to run the Flask web application
- `[x]` Keep `brain_swarm_system.py` clean of web startup calls (CLI only when run directly)
- `[x]` Run and verify the server and dashboard end-to-end (mock & real modes)
