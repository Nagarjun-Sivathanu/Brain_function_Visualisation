"""
Launch the Brain Function Visualisation website.

    python run_web.py            # serves on http://127.0.0.1:8000
    python run_web.py --port 9000

Then open the URL in a browser. Switch between Broadcast and Hierarchy modes in
the top bar. The backend talks to both reasoning models purely over JSON.
"""
import argparse
import uvicorn

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--reload", action="store_true")
    args = parser.parse_args()

    uvicorn.run("webapp.server:app", host=args.host, port=args.port, reload=args.reload)
