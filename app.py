#!/usr/bin/env python3
"""
Chat backend: proxies to Elastic Agent Builder converse API.
Run: uvicorn app:app --reload
"""

import os

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
import httpx

load_dotenv()

app = FastAPI(title="arXiv Research Assistant")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"])

KIBANA_URL = os.getenv("KIBANA_URL", "").rstrip("/")
KIBANA_API_KEY = os.getenv("KIBANA_API_KEY", "")
AGENT_ID = os.getenv("AGENT_ID", "basic-arxiv-assistant")


@app.get("/")
async def index():
    return FileResponse("static/index.html")


@app.post("/api/chat")
async def chat(body: dict):
    """Proxy to Elastic Agent Builder converse API."""
    message = body.get("message", "").strip()
    if not message:
        return {"error": "Message is required"}

    if not KIBANA_URL or not KIBANA_API_KEY:
        return {"error": "Set KIBANA_URL and KIBANA_API_KEY in .env"}

    url = f"{KIBANA_URL}/api/agent_builder/converse"
    headers = {
        "Authorization": f"ApiKey {KIBANA_API_KEY}",
        "kbn-xsrf": "true",
        "Content-Type": "application/json",
    }
    payload = {"input": message, "agent_id": AGENT_ID}

    async with httpx.AsyncClient(timeout=60.0) as client:
        try:
            r = await client.post(url, headers=headers, json=payload)
            r.raise_for_status()
            data = r.json()
            # Extract response text (structure may vary)
            out = data.get("output") or data
            text = out.get("content") if isinstance(out, dict) else str(out)
            if not text:
                text = data.get("response") or str(data)
            return {"response": text}
        except httpx.HTTPStatusError as e:
            return {"error": f"Agent API error: {e.response.status_code}", "detail": e.response.text}
        except Exception as e:
            return {"error": str(e)}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
