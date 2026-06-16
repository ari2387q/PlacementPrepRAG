import os
import numpy as np
from typing import List, Any
from sentence_transformers import SentenceTransformer
from src.embedding import EmbeddingPipeline
from pinecone import Pinecone, ServerlessSpec
import math
from collections import Counter

class BM25:
    def __init__(self, k1=1.2, b=0.75):
        self.k1 = k1
        self.b = b
        self.docs = []
        self.doc_ids = []
        self.doc_lengths = []
        self.avg_dl = 0
        self.doc_freqs = {}
        self.n_docs = 0

    def index(self, documents, doc_ids):
        self.docs = documents
        self.doc_ids = doc_ids
        self.n_docs = len(documents)
        self.doc_lengths = []
        self.doc_freqs = {}

        for doc in documents:
            words = doc.lower().split()
            self.doc_lengths.append(len(words))
            unique_words = set(words)
            for word in unique_words:
                self.doc_freqs[word] = self.doc_freqs.get(word, 0) + 1

        self.avg_dl = sum(self.doc_lengths) / self.n_docs if self.n_docs else 1

    def score(self, query, doc_idx):
        query_words = query.lower().split()
        doc_words = self.docs[doc_idx].lower().split()
        doc_len = self.doc_lengths[doc_idx]
        word_counts = Counter(doc_words)
        score = 0.0

        for term in query_words:
            if term not in word_counts:
                continue
            tf = word_counts[term]
            df = self.doc_freqs.get(term, 0)
            idf = math.log((self.n_docs - df + 0.5) / (df + 0.5) + 1)
            numerator = tf * (self.k1 + 1)
            denominator = tf + self.k1 * (1 - self.b + self.b * doc_len / self.avg_dl)
            score += idf * numerator / denominator

        return score

    def search(self, query, top_k=10):
        scores = [(self.doc_ids[i], self.score(query, i)) for i in range(self.n_docs)]
        scores.sort(key=lambda x: x[1], reverse=True)
        return scores[:top_k]

class PineconeVectorStore:
    def __init__(self, embedding_model: str = "all-MiniLM-L6-v2", chunk_size=1000, chunk_overlap=200):
        self.embedding_model = embedding_model
        print("[DEBUG] About to load SentenceTransformer")

        self.model = SentenceTransformer(embedding_model)

        print("[DEBUG] SentenceTransformer loaded successfully")
        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap
        self.bm25 = BM25()
        self.all_chunks = []
        print("[DEBUG] Initializing Pinecone")
        self.pc = Pinecone(api_key=os.getenv("PINECONE_API_KEY"))
        self.index_name = os.getenv("PINECONE_INDEX", "placement-prep")

        if self.index_name not in self.pc.list_indexes().names():
            self.pc.create_index(
                name=self.index_name,
                dimension=384,
                metric="cosine",
                spec=ServerlessSpec(cloud="aws", region="us-east-1")
            )
            print(f"[INFO] Created Pinecone index: {self.index_name}")

        self.index = self.pc.Index(self.index_name)
        print(f"[INFO] Connected to Pinecone index: {self.index_name}")

    def build_from_documents(self, documents: List[Any]):
        print("DOCUMENT COUNT =", len(documents))
        print("FIRST DOC =", documents[:1])
        print(f"[INFO] Building vector store from {len(documents)} documents...")
        emb_pipe = EmbeddingPipeline(model_name=self.embedding_model, chunk_size=self.chunk_size, chunk_overlap=self.chunk_overlap)
        chunks = emb_pipe.chunk_documents(documents)
        embeddings = emb_pipe.embed_chunks(chunks)

        vectors = []
        for i, (chunk, embedding) in enumerate(zip(chunks, embeddings)):
            vectors.append({
                "id": f"chunk-{i}",
                "values": embedding.tolist(),
                "metadata": {"text": chunk.page_content,
                             "source": chunk.metadata.get("source", "unknown")}
            })

        batch_size = 100
        for i in range(0, len(vectors), batch_size):
            batch = vectors[i:i + batch_size]
            self.index.upsert(vectors=batch)

        print(f"[INFO] Upserted {len(vectors)} vectors to Pinecone")

    def query(self, query_text: str, top_k: int = 5):
        print(f"[INFO] Querying Pinecone for: '{query_text}'")
        query_emb = self.model.encode([query_text])[0].tolist()
        results = self.index.query(vector=query_emb, top_k=top_k, include_metadata=True)

        return [
            {
                "index": i,
                "distance": match.score,
                "metadata": match.metadata
            }
            for i, match in enumerate(results.matches)
        ]

    def is_empty(self):
        stats = self.index.describe_index_stats()
        return stats.total_vector_count == 0
    
    def load_bm25_from_pinecone(self):
        print("[INFO] Loading all chunks from Pinecone for BM25...")
        stats = self.index.describe_index_stats()
        total = stats.total_vector_count
    
        texts = []
        ids = []
        batch_size = 100
    
        for i in range(0, total, batch_size):
            batch_ids = [f"chunk-{j}" for j in range(i, min(i + batch_size, total))]
            results = self.index.fetch(ids=batch_ids)
            for id, vector in results.vectors.items():
                texts.append(vector.metadata.get("text", ""))
                ids.append(id)
    
        self.all_chunks = texts
        self.bm25.index(texts, ids)
        print(f"[INFO] BM25 indexed {len(texts)} chunks")

    def reciprocal_rank_fusion(self, ranked_lists, k=60):
        scores = {}
        for ranked_list in ranked_lists:
            for rank, (doc_id, _) in enumerate(ranked_list):
                if doc_id not in scores:
                    scores[doc_id] = 0.0
                scores[doc_id] += 1.0 / (k + rank + 1)
        fused = sorted(scores.items(), key=lambda x: x[1], reverse=True)
        return fused

    def hybrid_query(self, query_text: str, top_k: int = 5):
        print(f"[INFO] Hybrid querying for: '{query_text}'")
    
    # Vector search — get top 15
        query_emb = self.model.encode([query_text])[0].tolist()
        vector_results = self.index.query(
            vector=query_emb, top_k=30, include_metadata=True
     )
        vector_ranked = [(match.id, match.score) for match in vector_results.matches]
        """for doc_id, score in vector_ranked[:10]:
            print(f"{doc_id}->{score}")"""
    # BM25 search — get top 15
        bm25_ranked = self.bm25.search(query_text, top_k=30)
        """for doc_id, score in bm25_ranked[:10]:
            print(f"{doc_id} -> {score}")"""
    # RRF fusion
        fused = self.reciprocal_rank_fusion([vector_ranked, bm25_ranked])
        """for doc_id, score in fused[:10]:
            print(f"{doc_id} -> {score}")"""
    # Fetch metadata for top results
        top_ids = [doc_id for doc_id, _ in fused[:top_k]]
        fetch_results = self.index.fetch(ids=top_ids)
        results = []
        for i, doc_id in enumerate(top_ids):
            if doc_id in fetch_results.vectors:
                metadata = fetch_results.vectors[doc_id].metadata
                results.append({
                    "index": i,
                    "distance": fused[i][1],
                    "metadata": metadata
                    })
                """print("DOC ID :", doc_id)
                print("SOURCE :", metadata.get("source"))
                print("TEXT   :", metadata.get("text", "")[:500])"""

        return results