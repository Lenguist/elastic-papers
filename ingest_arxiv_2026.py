#!/usr/bin/env python3
"""
Ingest arXiv papers from 2026 into Elasticsearch.
Uses OAI-PMH to harvest metadata (title, authors, abstract) and bulk indexes.

Usage:
  pip install -r requirements.txt
  cp .env.example .env   # add your Elasticsearch credentials
  python ingest_arxiv_2026.py

Env vars for Elasticsearch:
  - Elastic Cloud: ELASTICSEARCH_CLOUD_ID, ELASTICSEARCH_API_KEY (create in Security → API Keys)
  - Local:         ELASTICSEARCH_URL (default http://localhost:9200), optional USER/PASSWORD
"""

import os
import re
import sys
import time
import xml.etree.ElementTree as ET
from datetime import date
from urllib.parse import urlencode

import requests
from dotenv import load_dotenv
from elasticsearch import Elasticsearch
from elasticsearch.helpers import bulk

load_dotenv()

# --- Elasticsearch connection ---

def _get_es_client() -> Elasticsearch:
    cloud_id = os.getenv("ELASTICSEARCH_CLOUD_ID")
    url = os.getenv("ELASTICSEARCH_URL", "http://localhost:9200")
    user = os.getenv("ELASTICSEARCH_USER")
    password = os.getenv("ELASTICSEARCH_PASSWORD")
    api_key = os.getenv("ELASTICSEARCH_API_KEY")

    if cloud_id:
        if api_key:
            return Elasticsearch(cloud_id=cloud_id, api_key=api_key)
        if user and password:
            return Elasticsearch(cloud_id=cloud_id, basic_auth=(user, password))
        print("Error: For Elastic Cloud set ELASTICSEARCH_API_KEY (create in Security → API Keys)")
        sys.exit(1)

    if user and password:
        return Elasticsearch(hosts=[url], basic_auth=(user, password))
    return Elasticsearch(hosts=[url])


# --- arXiv OAI-PMH ---

OAI_BASE = "https://export.arxiv.org/oai2"
ARXIV_NS = {"arxiv": "http://arxiv.org/OAI/arXiv/"}  # arXiv OAI metadata namespace


def _text(el) -> str | None:
    if el is None:
        return None
    t = (el.text or "").strip()
    if el.tail:
        t = (t + " " + (el.tail or "").strip()).strip()
    return t if t else None


def _local_name(tag: str) -> str:
    return tag.split("}")[-1] if "}" in tag else tag


def _first(el, tag: str):
    if el is None:
        return None
    child = el.find(f"arxiv:{tag}", ARXIV_NS)
    if child is not None:
        return child
    child = el.find(tag)
    if child is not None:
        return child
    for c in el.iter():
        if _local_name(c.tag) == tag:
            return c
    return None


def _all(el, tag: str):
    if el is None:
        return []
    found = el.findall(f"arxiv:{tag}", ARXIV_NS)
    if found:
        return found
    found = el.findall(f".//{tag}")
    if found:
        return found
    return [c for c in el.iter() if _local_name(c.tag) == tag]


OAI_NS = "http://www.openarchives.org/OAI/2.0/"


def parse_arxiv_record(record_el) -> dict | None:
    """Extract title, authors, abstract from an OAI <record>."""
    metadata = record_el.find(f".//{{{OAI_NS}}}metadata")
    if metadata is None:
        return None

    # arXiv block uses http://arxiv.org/OAI/arXiv/
    arxiv = metadata.find("arxiv:arXiv", ARXIV_NS)
    if arxiv is None:
        arxiv = metadata.find(".//*[local-name()='arXiv']")
    if arxiv is None:
        arxiv = metadata  # fallback: use metadata itself

    title_el = _first(arxiv, "title")
    abstract_el = _first(arxiv, "abstract")
    id_el = _first(arxiv, "id")
    created_el = _first(arxiv, "created")
    categories_el = _first(arxiv, "categories")

    title = _text(title_el) if title_el is not None else None
    abstract = _text(abstract_el) if abstract_el is not None else None
    arxiv_id = _text(id_el) if id_el is not None else None
    created = _text(created_el) if created_el is not None else None
    categories_raw = _text(categories_el) if categories_el is not None else ""
    categories = [c.strip() for c in categories_raw.split() if c.strip()] if categories_raw else []

    authors = []
    authors_el = _first(arxiv, "authors")
    if authors_el is not None:
        for author in _all(authors_el, "author"):
            k = _first(author, "keyname")
            f = _first(author, "forenames")
            keyname = _text(k) if k is not None else ""
            forenames = _text(f) if f is not None else ""
            name = f"{forenames} {keyname}".strip() or keyname or forenames
            if name:
                authors.append(name)

    # Normalize arxiv_id (strip version)
    if arxiv_id:
        arxiv_id = re.sub(r"v\d+$", "", arxiv_id)

    if not arxiv_id:
        return None

    return {
        "arxiv_id": arxiv_id,
        "title": title or "",
        "authors": authors,
        "abstract": abstract or "",
        "categories": categories,
        "created": created,
    }


def fetch_oai_page(from_date: str, until_date: str, resumption_token: str | None = None, page_num: int = 1) -> tuple[list[dict], str | None]:
    """Fetch one page of records. Returns (list of parsed docs, next resumption_token or None)."""
    if resumption_token:
        url = f"{OAI_BASE}?verb=ListRecords&resumptionToken={resumption_token}"
    else:
        params = {
            "verb": "ListRecords",
            "metadataPrefix": "arXiv",
            "from": from_date,
            "until": until_date,
        }
        url = f"{OAI_BASE}?{urlencode(params)}"

    print(f"  [1/3] Fetching page {page_num} from arXiv...", flush=True)
    headers = {"User-Agent": "elastic-papers-ingest/1.0 (mailto:dev@local)"}
    resp = requests.get(url, headers=headers, timeout=120)
    print(f"  [1/3] Page {page_num} received ({len(resp.content) // 1024} KB)", flush=True)

    if not resp.ok:
        raise RuntimeError(f"OAI request failed: {resp.status_code} {resp.text[:500]}")

    root = ET.fromstring(resp.content)

    # Check for OAI error
    err = root.find(".//{http://www.openarchives.org/OAI/2.0/}error")
    if err is not None:
        code = err.get("code", "")
        raise RuntimeError(f"OAI error: {code} - {(err.text or '').strip()}")

    records = []
    for rec in root.findall(".//{http://www.openarchives.org/OAI/2.0/}record"):
        status = rec.find(".//{http://www.openarchives.org/OAI/2.0/}header")
        if status is not None and status.get("status") == "deleted":
            continue
        doc = parse_arxiv_record(rec)
        if doc:
            records.append(doc)

    rt = root.find(".//{http://www.openarchives.org/OAI/2.0/}resumptionToken")
    token = None
    if rt is not None and rt.text:
        token = rt.text.strip()

    return records, token


def filter_2026(docs: list[dict]) -> list[dict]:
    """Keep only papers with created date in 2026."""
    out = []
    for d in docs:
        created = d.get("created") or ""
        if created.startswith("2026"):
            out.append(d)
    return out


# --- Main ---

INDEX_NAME = "arxiv-papers-2026"


def ensure_index(es: Elasticsearch):
    """Create index if it doesn't exist."""
    if es.indices.exists(index=INDEX_NAME):
        return
    es.indices.create(
        index=INDEX_NAME,
        body={
            "mappings": {
                "properties": {
                    "arxiv_id": {"type": "keyword"},
                    "title": {"type": "text"},
                    "authors": {"type": "keyword"},
                    "abstract": {"type": "text"},
                    "categories": {"type": "keyword"},
                    "created": {"type": "date", "format": "yyyy-MM-dd||yyyy-MM-dd'T'HH:mm:ss'Z'||strict_date_optional_time"},
                }
            }
        },
    )
    print(f"Created index '{INDEX_NAME}'")


def main():
    es = _get_es_client()
    print("Testing Elasticsearch connection...")
    info = es.info()
    print(f"Connected to ES {info['version']['number']}")

    ensure_index(es)

    from_date = "2026-01-01"
    until_date = min(date.today().isoformat(), "2026-12-31")  # arXiv rejects future dates
    print(f"Harvesting arXiv from {from_date} to {until_date}...")
    print("(First page can take 30-60s - arXiv may be slow)\n")

    total_indexed = 0
    token = None
    page = 0

    while True:
        page += 1
        records, token = fetch_oai_page(from_date, until_date, token, page_num=page)
        filtered = filter_2026(records)
        print(f"  [2/3] Parsed {len(records)} records, {len(filtered)} from 2026", flush=True)

        if filtered:
            print(f"  [3/3] Indexing {len(filtered)} papers...", end=" ", flush=True)
            actions = [
                {
                    "_index": INDEX_NAME,
                    "_id": d["arxiv_id"],
                    "_source": {k: d[k] for k in ("arxiv_id", "title", "authors", "abstract", "categories", "created")},
                }
                for d in filtered
            ]
            ok, failed = bulk(es.options(request_timeout=60), actions, raise_on_error=False)
            total_indexed += len(actions)
            if failed:
                print(f"done (some failures: {len(failed)})")
            else:
                print(f"done. Total indexed: {total_indexed}")
        else:
            print(f"  [3/3] Skipping index (no 2026 papers in this batch)", flush=True)

        if not token:
            print("  No more pages.", flush=True)
            break

        print(f"  Waiting 1s before next page...", flush=True)
        time.sleep(1)

    print(f"Done. Indexed {total_indexed} papers into '{INDEX_NAME}'")


if __name__ == "__main__":
    main()
