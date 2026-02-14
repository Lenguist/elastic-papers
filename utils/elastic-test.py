#!/usr/bin/env python3
"""
Minimal Elasticsearch connection test.
Load credentials from .env (copy .env.example to .env and fill in your values).

  pip install -r requirements.txt
  python elastic-test.py
"""

import os
from dotenv import load_dotenv
from elasticsearch import Elasticsearch

load_dotenv()


def get_es_client():
    """Connect using env vars. Supports Elastic Cloud (API key) or local URL."""
    cloud_id = os.getenv("ELASTICSEARCH_CLOUD_ID")
    api_key = os.getenv("ELASTICSEARCH_API_KEY")
    url = os.getenv("ELASTICSEARCH_URL", "http://localhost:9200")
    user = os.getenv("ELASTICSEARCH_USER")
    password = os.getenv("ELASTICSEARCH_PASSWORD")

    if cloud_id and api_key:
        return Elasticsearch(cloud_id=cloud_id, api_key=api_key)
    if cloud_id and user and password:
        return Elasticsearch(cloud_id=cloud_id, basic_auth=(user, password))
    if url and user and password:
        return Elasticsearch(hosts=[url], basic_auth=(user, password))
    if url:
        return Elasticsearch(hosts=[url])
    raise ValueError(
        "For Elastic Cloud: set ELASTICSEARCH_CLOUD_ID + ELASTICSEARCH_API_KEY "
        "(create API key in Security → API Keys in the dashboard)"
    )


if __name__ == "__main__":
    cloud_id = os.getenv("ELASTICSEARCH_CLOUD_ID")
    api_key = os.getenv("ELASTICSEARCH_API_KEY")
    if not cloud_id or not api_key:
        print("Error: .env is missing credentials. Add:")
        print("  ELASTICSEARCH_CLOUD_ID=My_Elasticsearch_project:dXMt...")
        print("  ELASTICSEARCH_API_KEY=your_api_key")
        print("\n(Get Cloud ID from deployment overview, API key from Security → API Keys)")
        exit(1)

    es = get_es_client()
    info = es.info()
    print("Connected to Elasticsearch:", info["version"]["number"])
