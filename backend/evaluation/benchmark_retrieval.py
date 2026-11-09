"""Offline retrieval benchmark for the bundled placement-prep PDF corpus.

Run from the repository root with the project environment:
    python backend/evaluation/benchmark_retrieval.py --offline

Labels point to source pages, not individual chunks. The benchmark intentionally
does not call Pinecone or Groq, so it can run without production credentials.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from itertools import pairwise
from pathlib import Path

import numpy as np
from langchain_community.document_loaders import PyPDFLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))
from src.vectorstore import BM25


def _metrics(ranked: list[int], relevant: set[int], total_relevant: int, k: int) -> dict[str, float]:
    top = ranked[:k]
    hits = [position for position, chunk_id in enumerate(top, 1) if chunk_id in relevant]
    dcg = sum(1 / np.log2(position + 1) for position in hits)
    ideal = sum(1 / np.log2(position + 1) for position in range(1, min(total_relevant, k) + 1))
    return {
        "recall": len(hits) / total_relevant if total_relevant else 0.0,
        "precision": len(hits) / k,
        "mrr": 1 / hits[0] if hits else 0.0,
        "ndcg": dcg / ideal if ideal else 0.0,
    }


def _load_corpus():
    paths = sorted((ROOT / "data").rglob("*.pdf"))
    documents = []
    for path in paths:
        relative_source = path.relative_to(ROOT).as_posix()
        for page in PyPDFLoader(str(path)).load():
            page.metadata["source"] = relative_source
            page.metadata["page"] = int(page.metadata.get("page", 0)) + 1
            documents.append(page)
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=1000,
        chunk_overlap=200,
        length_function=len,
        separators=["\n\n", "\n", ".", ""],
    )
    return paths, splitter.split_documents(documents)


def _current_rerank(query: str, chunk_ids: list[int], fusion_scores: dict[int, float], texts: list[str]) -> list[int]:
    stop_words = {
        "the", "a", "an", "is", "are", "was", "were", "what", "how", "why",
        "when", "where", "do", "does", "for", "of", "in", "to", "and", "or",
        "on", "at", "by", "it", "its", "this", "that", "with", "from", "be",
        "has", "have", "had", "not", "but",
    }
    query_words = set(query.lower().split())
    query_terms = query_words - stop_words
    query_list = [word for word in query.lower().split() if word not in stop_words]
    query_bigrams = {f"{a} {b}" for a, b in pairwise(query_list)}
    scored = []
    for chunk_id in chunk_ids:
        text = texts[chunk_id].lower()
        words = set(text.split())
        overlap = len(query_terms & words)
        bigrams = sum(1 for bigram in query_bigrams if bigram in text)
        early = sum(0.5 for term in query_terms if 0 <= text.find(term) < len(text) // 3)
        score = overlap + bigrams * 2 + early + fusion_scores[chunk_id] * 5
        scored.append((chunk_id, score))
    return [chunk_id for chunk_id, _ in sorted(scored, key=lambda item: item[1], reverse=True)]


def run(offline: bool) -> dict:
    if offline:
        os.environ["HF_HUB_OFFLINE"] = "1"
        os.environ["TRANSFORMERS_OFFLINE"] = "1"

    from sentence_transformers import SentenceTransformer

    model_name = "sentence-transformers/all-MiniLM-L6-v2"
    model = SentenceTransformer(model_name, device="cpu", local_files_only=offline)
    paths, chunks = _load_corpus()
    texts = [chunk.page_content for chunk in chunks]
    keys = [(chunk.metadata["source"], chunk.metadata["page"]) for chunk in chunks]
    bm25 = BM25()
    bm25.index(texts, list(range(len(texts))))

    t0 = time.perf_counter()
    embeddings = model.encode(texts, normalize_embeddings=True, show_progress_bar=False)
    embedding_ms = (time.perf_counter() - t0) * 1000
    matrix = np.asarray(embeddings, dtype=np.float32)
    gold = json.loads((Path(__file__).with_name("queries.json")).read_text())
    k = 5
    per_query = []
    timing_totals: dict[str, float] = {
        "corpus_embedding_ms": embedding_ms,
        "query_embedding_ms": 0,
        "dense_retrieval_ms": 0,
        "bm25_retrieval_ms": 0,
        "fusion_and_fetch_ms": 0,
        "reranking_ms": 0,
    }

    for item in gold:
        q0 = time.perf_counter()
        query_vector = model.encode([item["query"]], normalize_embeddings=True, show_progress_bar=False)[0]
        timing_totals["query_embedding_ms"] += (time.perf_counter() - q0) * 1000

        t0 = time.perf_counter()
        dense = np.argsort(-(matrix @ np.asarray(query_vector, dtype=np.float32)))[: k * 3].tolist()
        timing_totals["dense_retrieval_ms"] += (time.perf_counter() - t0) * 1000

        t0 = time.perf_counter()
        sparse = bm25.search(item["query"], top_k=k * 3)
        timing_totals["bm25_retrieval_ms"] += (time.perf_counter() - t0) * 1000

        t0 = time.perf_counter()
        fused: dict[int, float] = {}
        for ranked in ([(chunk_id, 0) for chunk_id in dense], sparse):
            for rank, (chunk_id, _) in enumerate(ranked):
                fused[chunk_id] = fused.get(chunk_id, 0.0) + 1.0 / (60 + rank + 1)
        candidates = sorted(fused, key=fused.get, reverse=True)[: k * 3]
        timing_totals["fusion_and_fetch_ms"] += (time.perf_counter() - t0) * 1000

        fused_ranked = candidates[:]
        t0 = time.perf_counter()
        reranked = _current_rerank(item["query"], candidates, fused, texts)
        timing_totals["reranking_ms"] += (time.perf_counter() - t0) * 1000

        relevant_pages = {
            (entry["source"], page)
            for entry in item["relevant"]
            for page in entry["pages"]
        }
        relevant_chunks = {i for i, key in enumerate(keys) if key in relevant_pages}
        dense_metrics = _metrics(dense, relevant_chunks, len(relevant_chunks), k)
        sparse_metrics = _metrics([chunk_id for chunk_id, _ in sparse], relevant_chunks, len(relevant_chunks), k)
        fusion_metrics = _metrics(fused_ranked, relevant_chunks, len(relevant_chunks), k)
        hybrid_metrics = _metrics(reranked, relevant_chunks, len(relevant_chunks), k)
        per_query.append({
            "id": item["id"],
            "dense": dense_metrics,
            "bm25": sparse_metrics,
            "hybrid_rrf": fusion_metrics,
            "hybrid_reranked": hybrid_metrics,
            "hybrid_top_sources": [
                {"source": keys[i][0], "page": keys[i][1]} for i in reranked[:k]
            ],
        })

    summary = {}
    for variant in ("dense", "bm25", "hybrid_rrf", "hybrid_reranked"):
        summary[variant] = {
            metric: round(float(np.mean([row[variant][metric] for row in per_query])), 4)
            for metric in ("recall", "precision", "mrr", "ndcg")
        }
    return {
        "benchmark": "local-bundled-pdfs-v1",
        "model": model_name,
        "corpus_pdf_count": len(paths),
        "corpus_chunk_count": len(chunks),
        "query_count": len(gold),
        "k": k,
        "metrics_macro_average": summary,
        "timings_ms": {name: round(value, 2) for name, value in timing_totals.items()},
        "per_query": per_query,
        "limitations": [
            "Dense retrieval uses the cached SentenceTransformers implementation of MiniLM, not FastEmbed ONNX or Pinecone.",
            "The benchmark is local and does not measure Groq answer quality or live service latency.",
            "Gold labels identify relevant PDF pages and need human review before treating the scores as a release gate.",
        ],
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--offline", action="store_true", help="Never fetch the model from the network")
    args = parser.parse_args()
    print(json.dumps(run(offline=args.offline), indent=2))
