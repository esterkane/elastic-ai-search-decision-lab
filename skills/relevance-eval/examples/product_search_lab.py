"""10-line example: how elastic-product-search-lab would import and run the skill.

Run from the product-search-lab repo root (with `relevance-eval` on the path,
e.g. `pip install -e ../elastic-ai-search-decision-lab/skills/relevance-eval`).
The only glue is a tiny adapter turning that repo's search into ranked doc ids.
"""

from relevance_eval import evaluate_thresholds, run_evaluation, to_markdown
from src.search.strategies import search_products  # product-search-lab's shared search

def search(query, strategy):  # inject: adapt search_products -> ranked product ids
    return [hit["id"] for hit in search_products(query, strategy=strategy, size=10)]

judgments = {"running shoes": ["p-101", "p-205"], "rain jacket": {"p-77": 2, "p-88": 1}}
strategies = ["baseline_bm25", "boosted_bm25", "enriched_profile"]
report = run_evaluation(judgments, search, strategies, ks=(1, 5))
print(to_markdown(report, evaluate_thresholds(report, {"enriched_profile": {"ndcg@5": 0.5}})))
