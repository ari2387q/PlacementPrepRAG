import os
import numpy as np
from typing import List, Any
from sentence_transformers import SentenceTransformer
from backend.src.embedding import EmbeddingPipeline
from pinecone import Pinecone, ServerlessSpec


class PineconeVectorStore:
    def __init__(self, embedding_model: str = "all-MiniLM-L6-v2", chunk_size=1000, chunk_overlap=200):
        self.embedding_model = embedding_model
        self.model = SentenceTransformer(embedding_model)
        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap

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
        print(f"[INFO] Building vector store from {len(documents)} documents...")
        emb_pipe = EmbeddingPipeline(model_name=self.embedding_model, chunk_size=self.chunk_size, chunk_overlap=self.chunk_overlap)
        chunks = emb_pipe.chunk_documents(documents)
        embeddings = emb_pipe.embed_chunks(chunks)

        vectors = []
        for i, (chunk, embedding) in enumerate(zip(chunks, embeddings)):
            vectors.append({
                "id": f"chunk-{i}",
                "values": embedding.tolist(),
                "metadata": {"text": chunk.page_content}
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