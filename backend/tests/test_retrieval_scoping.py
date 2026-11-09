from types import SimpleNamespace

from src.rag_search import RAGSearch
from src.vectorstore import PineconeVectorStore


class FakeIndex:
    def __init__(self, metadata):
        self.metadata = metadata
        self.query_kwargs = None

    def query(self, **kwargs):
        self.query_kwargs = kwargs
        return SimpleNamespace(matches=[
            SimpleNamespace(id="chunk-0", score=0.9),
            SimpleNamespace(id="chunk-1", score=0.8),
            SimpleNamespace(id="chunk-2", score=0.7),
        ])

    def fetch(self, ids):
        return SimpleNamespace(vectors={
            doc_id: SimpleNamespace(metadata=self.metadata[doc_id])
            for doc_id in ids
            if doc_id in self.metadata
        })


def test_company_filter_uses_source_fallback_for_legacy_index_metadata():
    store = PineconeVectorStore.__new__(PineconeVectorStore)
    store.model = SimpleNamespace(embed=lambda texts: [[0.1, 0.2]])
    store.index = FakeIndex({
        "chunk-0": {"source": "data/companies/tcs.pdf", "text": "TCS interview"},
        "chunk-1": {"source": "data/companies/infossy.pdf", "text": "Infosys HR interview"},
        "chunk-2": {"source": "data/companies/ibm.pdf", "text": "IBM interview"},
    })
    store.bm25 = SimpleNamespace(search=lambda query, top_k: [
        ("chunk-0", 2.0), ("chunk-1", 1.0), ("chunk-2", 0.5),
    ])

    timings = {}
    results = store.hybrid_query("Infosys HR interview", top_k=3, stage_timings=timings)

    assert "filter" not in store.index.query_kwargs
    assert results
    assert all("infossy.pdf" in result["metadata"]["source"] for result in results)
    assert {"query_embedding_ms", "dense_retrieval_ms", "bm25_search_ms", "fusion_ms", "reranking_ms"} <= timings.keys()


def test_rag_chat_context_clear_only_removes_one_account():
    rag = RAGSearch.__new__(RAGSearch)
    rag.chat_histories = {"account-a": ["a"], "account-b": ["b"]}

    rag.clear_history(user_id="account-a")

    assert rag.chat_histories == {"account-b": ["b"]}
