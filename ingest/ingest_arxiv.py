#!/usr/bin/env python3
"""
arXiv OAI-PMH ingestion into Elasticsearch. Supports single date range or monthly backfill.

Usage:
  # Single range
  python ingest_arxiv.py --from 2026-01-01 --until 2026-02-14

  # Monthly backfill (like paperfan)
  python ingest_arxiv.py --start 2024-01 --end 2026-02

  # With semantic index
  ES_INDEX=arxiv-papers-2026-semantic python ingest_arxiv.py --start 2025-01 --end 2026-02

  # CS domain only (computer science papers)
  python ingest_arxiv.py --from 2025-01-01 --until 2025-03-31 --cs-only

Env: ELASTICSEARCH_CLOUD_ID, ELASTICSEARCH_API_KEY, ES_INDEX (default: arxiv-papers-2026)
"""

import argparse
import os
import re
import sys
import time
import xml.etree.ElementTree as ET
from datetime import date, timedelta
from urllib.parse import urlencode

import requests
from dotenv import load_dotenv
from elasticsearch import Elasticsearch
from elasticsearch.helpers import bulk

load_dotenv()

INDEX_NAME = os.getenv("ES_INDEX", "arxiv-papers-2026")

OAI_BASE = "https://export.arxiv.org/oai2"
ARXIV_NS = {"arxiv": "http://arxiv.org/OAI/arXiv/"}
OAI_NS = "http://www.openarchives.org/OAI/2.0/"


def _get_es_client() -> Elasticsearch:
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
    print("Error: Set ELASTICSEARCH_CLOUD_ID + ELASTICSEARCH_API_KEY", file=sys.stderr)
    sys.exit(1)


def _text(el) -> str | None:
    if el is None:
        return None
    t = (el.text or "").strip()
    return t if t else None


def _first(el, tag: str):
    if el is None:
        return None
    for ns in (ARXIV_NS, {}):
        c = el.find(f"arxiv:{tag}", ns) if ns else el.find(tag)
        if c is not None:
            return c
    for c in el.iter():
        if c.tag.split("}")[-1] == tag:
            return c
    return None


def _all(el, tag: str):
    if el is None:
        return []
    f = el.findall(f"arxiv:{tag}", ARXIV_NS)
    if f:
        return f
    return [c for c in el.iter() if c.tag.split("}")[-1] == tag]


def parse_record(record_el) -> dict | None:
    meta = record_el.find(f".//{{{OAI_NS}}}metadata")
    if meta is None:
        return None
    arxiv = meta.find("arxiv:arXiv", ARXIV_NS) or meta.find(".//*[local-name()='arXiv']") or meta

    title = _text(_first(arxiv, "title")) or ""
    abstract = _text(_first(arxiv, "abstract")) or ""
    arxiv_id = _text(_first(arxiv, "id"))
    created = _text(_first(arxiv, "created")) or ""
    cats = _text(_first(arxiv, "categories")) or ""
    categories = [c.strip() for c in cats.split() if c.strip()]

    authors = []
    authors_el = _first(arxiv, "authors")
    if authors_el:
        for a in _all(authors_el, "author"):
            k = _text(_first(a, "keyname")) or ""
            f = _text(_first(a, "forenames")) or ""
            name = f"{f} {k}".strip() or k or f
            if name:
                authors.append(name)

    if not arxiv_id:
        return None
    arxiv_id = re.sub(r"v\d+$", "", arxiv_id)

    return {
        "arxiv_id": arxiv_id,
        "title": title,
        "authors": authors,
        "abstract": abstract,
        "categories": categories,
        "created": created,
    }


def fetch_page(from_d: str, until_d: str, token: str | None = None) -> tuple[list[dict], str | None]:
    if token:
        url = f"{OAI_BASE}?verb=ListRecords&resumptionToken={token}"
    else:
        url = f"{OAI_BASE}?{urlencode({'verb':'ListRecords','metadataPrefix':'arXiv','from':from_d,'until':until_d})}"
    r = requests.get(url, headers={"User-Agent": "elastic-papers/1.0"}, timeout=120)
    if not r.ok:
        raise RuntimeError(f"OAI failed: {r.status_code}")
    root = ET.fromstring(r.content)
    err = root.find(".//{http://www.openarchives.org/OAI/2.0/}error")
    if err is not None:
        raise RuntimeError(f"OAI: {err.get('code','')} - {(err.text or '').strip()}")

    records = []
    for rec in root.findall(".//{http://www.openarchives.org/OAI/2.0/}record"):
        h = rec.find(".//{http://www.openarchives.org/OAI/2.0/}header")
        if h is not None and h.get("status") == "deleted":
            continue
        doc = parse_record(rec)
        if doc:
            records.append(doc)
    rt = root.find(".//{http://www.openarchives.org/OAI/2.0/}resumptionToken")
    ntok = (rt.text or "").strip() or None
    return records, ntok


def filter_in_range(docs: list[dict], from_d: str, until_d: str) -> list[dict]:
    return [d for d in docs if from_d <= (d.get("created") or "") <= until_d]


def filter_cs_only(docs: list[dict]) -> list[dict]:
    """Keep only papers with at least one cs.* category (computer science)."""
    return [d for d in docs if any((c or "").startswith("cs.") for c in d.get("categories") or [])]


def ingest_range(es: Elasticsearch, from_d: str, until_d: str, cs_only: bool = False, verbose: bool = True) -> int:
    total = 0
    token = None
    page = 0
    while True:
        page += 1
        records, token = fetch_page(from_d, until_d, token)
        filtered = filter_in_range(records, from_d, until_d)
        if cs_only:
            filtered = filter_cs_only(filtered)
        if filtered:
            actions = [
                {"_index": INDEX_NAME, "_id": d["arxiv_id"], "_source": {k: d[k] for k in ("arxiv_id", "title", "authors", "abstract", "categories", "created")}}
                for d in filtered
            ]
            bulk(es.options(request_timeout=60), actions, raise_on_error=False)
            total += len(actions)
        if verbose:
            print(f"  p{page}: +{len(filtered)} (total {total})", flush=True)
        if not token:
            break
        time.sleep(1)
    return total


def ensure_index(es: Elasticsearch):
    if es.indices.exists(index=INDEX_NAME):
        return
    if INDEX_NAME.endswith("-semantic"):
        raise SystemExit(f"Create semantic index first: python scripts/create_index.py semantic")
    mapping = {
        "arxiv_id": {"type": "keyword"},
        "title": {"type": "text"},
        "authors": {"type": "keyword"},
        "abstract": {"type": "text"},
        "categories": {"type": "keyword"},
        "created": {"type": "date", "format": "yyyy-MM-dd||yyyy-MM-dd'T'HH:mm:ss'Z'||strict_date_optional_time"},
    }
    es.indices.create(index=INDEX_NAME, mappings={"properties": mapping})
    print(f"Created index '{INDEX_NAME}'")


def month_range(start_ym: str, end_ym: str):
    def parse(ym):
        y, m = map(int, ym.split("-"))
        if not (1 <= m <= 12):
            raise ValueError(f"Invalid YYYY-MM: {ym}")
        return y, m

    sy, sm = parse(start_ym)
    ey, em = parse(end_ym)
    if sy * 12 + sm > ey * 12 + em:
        raise ValueError(f"start must be <= end: {start_ym} > {end_ym}")

    today = date.today().isoformat()
    y, m = sy, sm
    while y < ey or (y == ey and m <= em):
        from_d = f"{y}-{m:02d}-01"
        until_d = (date(y, m + 1, 1) - timedelta(days=1)).isoformat() if m < 12 else f"{y}-12-31"
        until_d = min(until_d, today)
        if from_d > today:
            return
        yield f"{y}-{m:02d}", from_d, until_d
        m += 1
        if m > 12:
            m, y = 1, y + 1


def main():
    p = argparse.ArgumentParser(description="Ingest arXiv into Elasticsearch")
    p.add_argument("--from", dest="from_", metavar="YYYY-MM-DD", help="Start date (single range)")
    p.add_argument("--until", metavar="YYYY-MM-DD", help="End date (single range)")
    p.add_argument("--start", metavar="YYYY-MM", help="Start month (backfill mode)")
    p.add_argument("--end", metavar="YYYY-MM", help="End month (backfill mode)")
    p.add_argument("--quiet", "-q", action="store_true", help="Less output")
    p.add_argument("--cs-only", action="store_true", help="Ingest only computer science papers (categories starting with cs.)")
    args = p.parse_args()

    es = _get_es_client()
    ensure_index(es)

    today = date.today().isoformat()

    if args.start and args.end:
        # Monthly backfill
        total = 0
        for label, from_d, until_d in month_range(args.start, args.end):
            print(f">> {label} ({from_d}..{until_d})", flush=True)
            n = ingest_range(es, from_d, until_d, cs_only=args.cs_only, verbose=not args.quiet)
            total += n
        print(f"Done. Indexed {total} papers into '{INDEX_NAME}'")
    elif args.from_ and args.until:
        # Single range
        until_d = min(args.until, today)
        print(f">> {args.from_}..{until_d}", flush=True)
        n = ingest_range(es, args.from_, until_d, cs_only=args.cs_only, verbose=not args.quiet)
        print(f"Done. Indexed {n} papers into '{INDEX_NAME}'")
    else:
        p.print_help()
        sys.exit(1)


if __name__ == "__main__":
    main()
