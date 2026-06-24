import numpy as np
from src.vectorstore import BM25
import os
import tempfile
import uuid
from langchain_community.document_loaders import PyPDFLoader
from src.embedding import EmbeddingPipeline

class TempDocStore:
    """In-memory store for a single uploaded document. No Pinecone, no persistence."""

    def __init__(self):
        self.chunks = []          # raw chunk text
        self.sources = []         # source filename per chunk
        self.embeddings = None    # raw embeddings, shape (n_chunks, dim)
        self.normalized = None    # normalized embeddings for cosine sim
        self.bm25 = BM25()

    def build(self, chunks, embeddings):
        """
        chunks: list of langchain Document objects (have .page_content, .metadata)
        embeddings: list/array of vectors aligned with chunks
        """
        self.chunks = [c.page_content for c in chunks]
        self.sources = [c.metadata.get("source", "uploaded_file") for c in chunks]
        self.embeddings = np.array(embeddings, dtype=np.float32)

        norms = np.linalg.norm(self.embeddings, axis=1, keepdims=True)
        norms[norms == 0] = 1e-10
        self.normalized = self.embeddings / norms

        doc_ids = list(range(len(self.chunks)))
        self.bm25.index(self.chunks, doc_ids)

    def vector_search(self, query_embedding, top_k=15):
        q = np.array(query_embedding, dtype=np.float32)
        q_norm = q / (np.linalg.norm(q) + 1e-10)
        scores = self.normalized @ q_norm
        top_idx = np.argsort(-scores)[:top_k]
        return [(int(i), float(scores[i])) for i in top_idx]

    def hybrid_query(self, query_text, query_embedding, top_k=5):
        vector_ranked = self.vector_search(query_embedding, top_k=top_k * 3)
        bm25_ranked = self.bm25.search(query_text, top_k=top_k * 3)

        fused = self._reciprocal_rank_fusion([vector_ranked, bm25_ranked])
        top_ids = [doc_id for doc_id, _ in fused[:top_k * 10]]

        candidates = []
        for i, doc_id in enumerate(top_ids):
            candidates.append({
                "index": i,
                "distance": fused[i][1],
                "metadata": {"text": self.chunks[doc_id], "source": self.sources[doc_id]},
            })

        return self._rerank(query_text, candidates, top_k=top_k)

    @staticmethod
    def _reciprocal_rank_fusion(ranked_lists, k=60):
        scores = {}
        for ranked_list in ranked_lists:
            for rank, (doc_id, _) in enumerate(ranked_list):
                scores[doc_id] = scores.get(doc_id, 0.0) + 1.0 / (k + rank + 1)
        return sorted(scores.items(), key=lambda x: x[1], reverse=True)

    @staticmethod
    def _rerank(query, candidates, top_k=5):
        query_words = set(query.lower().split())
        stop_words = {"the", "a", "an", "is", "are", "was", "were", "what", "how",
                      "why", "when", "where", "do", "does", "for", "of", "in", "to",
                      "and", "or", "on", "at", "by", "it", "its", "this", "that",
                      "with", "from", "be", "has", "have", "had", "not", "but"}
        query_terms = query_words - stop_words

        scored = []
        for candidate in candidates:
            chunk_text = candidate["metadata"].get("text", "").lower()
            chunk_words = set(chunk_text.split())
            initial_score = candidate["distance"]

            term_overlap = len(query_terms & chunk_words)

            q_list = [w for w in query.lower().split() if w not in stop_words]
            query_bigrams = {q_list[i] + " " + q_list[i + 1] for i in range(len(q_list) - 1)}
            bigram_matches = sum(1 for bg in query_bigrams if bg in chunk_text)

            position_boost = 0
            for term in query_terms:
                pos = chunk_text.find(term)
                if pos != -1 and pos < len(chunk_text) // 3:
                    position_boost += 0.5

            rerank_score = (
                term_overlap * 1.0 + bigram_matches * 2.0 + position_boost + initial_score * 5.0
            )
            scored.append((candidate, rerank_score))

        scored.sort(key=lambda x: x[1], reverse=True)
        return [item[0] for item in scored[:top_k]]
    
    async def build_from_file(self, file, embedding_model):
    # save uploaded file temporarily
        tmp_path = os.path.join(tempfile.gettempdir(), f"{uuid.uuid4()}.pdf")
        try:
            with open(tmp_path, "wb") as f:
                f.write(await file.read())
            documents = PyPDFLoader(tmp_path).load()
        finally:
            if os.path.exists(tmp_path):
                os.remove(tmp_path)

        if not documents:
            return 0

        for doc in documents:
            doc.metadata["source"] = file.filename

        emb_pipe = EmbeddingPipeline(model=embedding_model)
        chunks = emb_pipe.chunk_documents(documents)
        embeddings = emb_pipe.embed_chunks(chunks)

        self.build(chunks, embeddings)
        return len(chunks)
