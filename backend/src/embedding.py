from typing import List,Dict,Any,Tuple
from langchain_text_splitters import RecursiveCharacterTextSplitter
import numpy as np
from sentence_transformers import SentenceTransformer


class EmbeddingPipeline:
    def __init__(self, model_name: str = "all-MiniLM-L6-v2", chunk_size: int = 1000, chunk_overlap: int = 200,model: SentenceTransformer=None):
        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap
        self.model = model if model is not None else SentenceTransformer(model_name)
        if model is None:
            print(f"[INFO] Loaded embedding model: {model_name}")
    def chunk_documents(self, documents: List[Any]) -> List[Any]:
        splitter = RecursiveCharacterTextSplitter(
            chunk_size=self.chunk_size,
            chunk_overlap=self.chunk_overlap,
            length_function=len,
            separators=["\n\n", "\n", ".", ""]
        )
        chunks = splitter.split_documents(documents)
        print(f"[INFO] Split {len(documents)} documents into {len(chunks)} chunks.")
        return chunks
    
    def embed_chunks(self, chunks: List[Any]) -> np.ndarray:
        texts = [chunk.page_content for chunk in chunks]
        print(f"[INFO] Generating embeddings for {len(texts)} chunks...")
        import torch
        torch.set_num_threads(1)
        import gc
        gc.collect()
        embeddings = self.model.encode(texts, show_progress_bar=False, batch_size=4)
        print(f"[INFO] Embeddings shape: {embeddings.shape}")
        return embeddings