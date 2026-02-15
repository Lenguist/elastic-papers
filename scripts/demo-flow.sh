#!/usr/bin/env bash
# Killer-demo test window: run what exists, echo what to do next.
# Prereq: npm run dev (so BASE is up)
set -e
BASE="${BASE:-http://localhost:3000}"

echo "=== Demo flow test (base: $BASE) ==="
echo ""

# 1. Library (exists)
echo "1. Library: add ACE paper"
curl -s -X POST "$BASE/api/library" \
  -H "Content-Type: application/json" \
  -d '{"papers":[{"id":"2510.04618","title":"ACE: Agentic Context Engineering","url":"https://arxiv.org/abs/2510.04618"}]}' | head -c 200
echo ""
echo ""

echo "2. Library: list"
curl -s "$BASE/api/library" | head -c 300
echo ""
echo ""

# 2. Notes (may 404 until you implement Phase 1)
echo "3. Notes: list (may 404 until you add GET /api/notes)"
if curl -s -o /dev/null -w "%{http_code}" "$BASE/api/notes" | grep -q 200; then
  curl -s "$BASE/api/notes" | head -c 200
else
  echo "   -> Add GET /api/notes and POST /api/notes (see documentation/killer-demo-full-implementation-plan.md)"
fi
echo ""
echo ""

# 3. Run benchmark (may 404 until you implement Phase 2)
echo "4. Run benchmark (may 404 until you add POST /api/run-benchmark)"
if curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/run-benchmark" -H "Content-Type: application/json" -d '{"benchmark_paper_id":"2510.04618"}' | grep -q 200; then
  curl -s -X POST "$BASE/api/run-benchmark" -H "Content-Type: application/json" -d '{"benchmark_paper_id":"2510.04618"}' | head -c 300
else
  echo "   -> Add POST /api/run-benchmark + Modal runner (see plan doc)"
fi
echo ""
echo ""

echo "=== Demo prompts to paste in chat (with app open at $BASE) ==="
echo "  1) Search for papers on agentic context engineering"
echo "  2) Add the ACE paper and Dynamic Cheatsheet paper to my library"
echo "  3) Compare the approaches of ACE and Dynamic Cheatsheet"
echo "  4) Save that comparison to my notes"
echo "  5) Run the ACE paper's AppWorld benchmark and save the results to my notes"
echo ""
echo "Once Notes + run_benchmark exist and the agent has save_to_notes and run_benchmark tools, this flow will be the killer demo."
