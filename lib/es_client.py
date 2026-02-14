"""Shared Elasticsearch client for elastic-papers."""

import os
import sys

from dotenv import load_dotenv
from elasticsearch import Elasticsearch

load_dotenv()


def get_client() -> Elasticsearch:
    cloud_id = os.getenv("ELASTICSEARCH_CLOUD_ID")
    url = os.getenv("ELASTICSEARCH_URL", "http://localhost:9200")
    user = os.getenv("ELASTICSEARCH_USER")
    password = os.getenv("ELASTICSEARCH_PASSWORD")
    api_key = os.getenv("ELASTICSEARCH_API_KEY")

    if cloud_id and api_key:
        return Elasticsearch(cloud_id=cloud_id, api_key=api_key)
    if cloud_id and user and password:
        return Elasticsearch(cloud_id=cloud_id, basic_auth=(user, password))
    if url and user and password:
        return Elasticsearch(hosts=[url], basic_auth=(user, password))
    if url:
        return Elasticsearch(hosts=[url])
    print("Error: Set ELASTICSEARCH_CLOUD_ID + ELASTICSEARCH_API_KEY in .env", file=sys.stderr)
    sys.exit(1)
