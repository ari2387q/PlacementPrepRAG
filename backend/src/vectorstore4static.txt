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
            source_path = chunk.metadata.get("source", "unknown")
            source_file = os.path.basename(source_path).lower()

            company = "general"

            if "tcs" in source_file:
                company = "tcs"
            elif "ibm" in source_file:
                company = "ibm"
            elif "infosys" in source_file:
                company = "infosys"
            vectors.append({
                "id": f"chunk-{i}",
                "values": embedding.tolist(),
                "metadata": {"text": chunk.page_content,
                             "source": source_path,
                             "company":company}
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
        # detect company from query
        query_lower = query_text.lower()
        filter_dict = None
        if "tcs" in query_lower:
            filter_dict = {"company": {"$eq": "tcs"}}
        elif "ibm" in query_lower:
            filter_dict = {"company": {"$eq": "ibm"}}
        elif "infosys" in query_lower:
            filter_dict = {"company": {"$eq": "infosys"}}

    #Vector search: top 15
        query_emb = self.model.encode([query_text])[0].tolist()
        vector_results = self.index.query(
            vector=query_emb, top_k=top_k*3, include_metadata=True,filter=filter_dict
     )
        vector_ranked = [(match.id, match.score) for match in vector_results.matches]
        """for doc_id, score in vector_ranked[:10]:
            print(f"{doc_id}->{score}")"""
    #BM25 search :top 15
        bm25_ranked = self.bm25.search(query_text, top_k=top_k*3)

        """for doc_id, score in bm25_ranked[:10]:
            print(f"{doc_id} -> {score}")"""
        
        if filter_dict and "source" in filter_dict:
            company = filter_dict["company"]["$eq"]
    #fetch metadata for bm25 results to check source
            bm25_ids = [doc_id for doc_id, _ in bm25_ranked]
            if bm25_ids:
                fetched = self.index.fetch(ids=bm25_ids)
                bm25_ranked = [
                    (doc_id, score) for doc_id, score in bm25_ranked
                    if doc_id in fetched.vectors and 
                    fetched.vectors[doc_id].metadata.get("company") == company
                ]
    #rrf fusion
        fused = self.reciprocal_rank_fusion([vector_ranked, bm25_ranked])

        """for doc_id, score in fused[:10]:
            print(f"{doc_id} -> {score}")"""
    
        top_ids = [doc_id for doc_id, _ in fused[:top_k*3]]
        fetch_results = self.index.fetch(ids=top_ids)
        candidates = [] #added candidates instead of results 
        for i, doc_id in enumerate(top_ids):
            if doc_id in fetch_results.vectors:
                metadata = fetch_results.vectors[doc_id].metadata
                #changed results to candidates here 
                candidates.append({
                    "index": i,
                    "distance": fused[i][1],
                    "metadata": metadata
                    })
                """print("DOC ID :", doc_id)
                print("SOURCE :", metadata.get("source"))
                print("TEXT   :", metadata.get("text", "")[:500])"""

        reranked = self.rerank(query_text, candidates, top_k=top_k)
        print(f"[INFO] Reranked {len(candidates)} candidates to top {top_k}")
        return reranked
    
    def rerank(self, query: str, candidates: list, top_k: int = 5):
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

        # term overlap
            term_overlap = len(query_terms & chunk_words)

        # bigram matches
            q_list = [w for w in query.lower().split() if w not in stop_words]
            query_bigrams = set()
            for i in range(len(q_list) - 1):
                query_bigrams.add(q_list[i]+ " " +q_list[i+1])
            bigram_matches = sum(1 for bg in query_bigrams if bg in chunk_text)

        # position boost — query terms appearing early in chunk
            position_boost = 0
            for term in query_terms:
                pos = chunk_text.find(term)
                if pos != -1 and pos < len(chunk_text) // 3:
                    position_boost += 0.5

            rerank_score = (
                term_overlap * 1.0 +bigram_matches* 2.0 + position_boost + initial_score * 5.0
            )
            scored.append((candidate, rerank_score))

        scored.sort(key=lambda x: x[1], reverse=True)
        return [item[0] for item in scored[:top_k]]