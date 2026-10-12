from typing import Any
import numpy as np
from fastembed import TextEmbedding
from langchain_text_splitters import RecursiveCharacterTextSplitter


class EmbeddingPipeline:
    def __init__(
        self,
        model_name: str = "sentence-transformers/all-MiniLM-L6-v2",
        chunk_size: int = 1000,
        chunk_overlap: int = 200,
        model: TextEmbedding = None,
    ):
        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap
        # Normalize model identifier if legacy name passed
        if model_name == "all-MiniLM-L6-v2":
            model_name = "sentence-transformers/all-MiniLM-L6-v2"
        self.model = model if model is not None else TextEmbedding(model_name=model_name)
        if model is None:
            print(f"[INFO] Loaded FastEmbed ONNX model: {model_name}")

    def chunk_documents(self, documents: list[Any]) -> list[Any]:
        splitter = RecursiveCharacterTextSplitter(
            chunk_size=self.chunk_size,
            chunk_overlap=self.chunk_overlap,
            length_function=len,
            separators=["\n\n", "\n", ".", ""],
        )
        chunks = splitter.split_documents(documents)
        print(f"[INFO] Split {len(documents)} documents into {len(chunks)} chunks.")
        return chunks

    def embed_chunks(self, chunks: list[Any]) -> np.ndarray:
        texts = [chunk.page_content for chunk in chunks]
        print(f"[INFO] Generating embeddings with FastEmbed for {len(texts)} chunks...")
        embeddings = np.array(list(self.model.embed(texts)))
        print(f"[INFO] Embeddings shape: {embeddings.shape}")
        return embeddings

    def embed_query(self, query: str) -> list[float]:
        """Convenience method to embed a single query text."""
        return list(list(self.model.embed([query]))[0])