#!/usr/bin/env python3
"""
Create Elasticsearch indices from the command line.

Usage:
  python scripts/create_index.py list
  python scripts/create_index.py basic          # arxiv-papers-2026 (text only)
  python scripts/create_index.py semantic       # arxiv-papers-2026-semantic (semantic_text)
  python scripts/create_index.py delete <name>  # delete an index

To ingest into the semantic index:
  ES_INDEX=arxiv-papers-2026-semantic python ingest_arxiv_2026.py
"""

import sys
from pathlib import Path

# Add project root for imports
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from dotenv import load_dotenv

load_dotenv()

from elasticsearch import Elasticsearch

from lib.es_client import get_client

# --- Index definitions ---

BASIC_INDEX = "arxiv-papers-2026"
SEMANTIC_INDEX = "arxiv-papers-2026-semantic"

BASIC_MAPPING = {
    "properties": {
        "arxiv_id": {"type": "keyword"},
        "title": {"type": "text"},
        "authors": {"type": "keyword"},
        "abstract": {"type": "text"},
        "categories": {"type": "keyword"},
        "created": {
            "type": "date",
            "format": "yyyy-MM-dd||yyyy-MM-dd'T'HH:mm:ss'Z'||strict_date_optional_time",
        },
    }
}

SEMANTIC_MAPPING = {
    "properties": {
        "arxiv_id": {"type": "keyword"},
        "title": {"type": "text"},
        "authors": {"type": "keyword"},
        "abstract": {"type": "semantic_text"},  # Auto-embeds on ingest (ELSER or Jina)
        "categories": {"type": "keyword"},
        "created": {
            "type": "date",
            "format": "yyyy-MM-dd||yyyy-MM-dd'T'HH:mm:ss'Z'||strict_date_optional_time",
        },
    }
}


def create_basic(es: Elasticsearch) -> None:
    if es.indices.exists(index=BASIC_INDEX):
        print(f"Index '{BASIC_INDEX}' already exists")
        return
    es.indices.create(index=BASIC_INDEX, mappings=BASIC_MAPPING)
    print(f"Created index '{BASIC_INDEX}'")


def create_semantic(es: Elasticsearch) -> None:
    if es.indices.exists(index=SEMANTIC_INDEX):
        print(f"Index '{SEMANTIC_INDEX}' already exists")
        return
    es.indices.create(index=SEMANTIC_INDEX, mappings=SEMANTIC_MAPPING)
    print(f"Created index '{SEMANTIC_INDEX}' (abstract uses semantic_text, auto-embedded on ingest)")


def list_indices(es: Elasticsearch) -> None:
    indices = es.cat.indices(format="json")
    for idx in sorted(indices, key=lambda x: x.get("index", "")):
        name = idx.get("index", "")
        if name.startswith("."):
            continue
        docs = idx.get("docs.count", "?")
        store = idx.get("store.size", "?")
        print(f"  {name:<40} docs={docs:<10} size={store}")


def delete_index(es: Elasticsearch, name: str) -> None:
    if not es.indices.exists(index=name):
        print(f"Index '{name}' does not exist")
        return
    es.indices.delete(index=name)
    print(f"Deleted index '{name}'")


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    es = get_client()
    cmd = sys.argv[1].lower()

    if cmd == "list":
        print("Indices:")
        list_indices(es)
    elif cmd == "basic":
        create_basic(es)
    elif cmd == "semantic":
        create_semantic(es)
    elif cmd == "delete":
        if len(sys.argv) < 3:
            print("Usage: python scripts/create_index.py delete <index_name>")
            sys.exit(1)
        delete_index(es, sys.argv[2])
    else:
        print(f"Unknown command: {cmd}")
        print(__doc__)
        sys.exit(1)


if __name__ == "__main__":
    main()
