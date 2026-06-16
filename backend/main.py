from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from contextlib import asynccontextmanager

rag = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    global rag
    from src.rag_search import RAGSearch
    rag = RAGSearch()
    yield

app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

class QueryRequest(BaseModel):
    query: str
    top_k: int = 5

@app.get("/")
def health():
    return {"status": "ok"}

@app.post("/query")
def query(request: QueryRequest):
    results = rag.search_and_summarize(request.query, request.top_k)
    return {"answer": results["answer"],"sources": results["sources"]}

@app.post("/clear")
def clear_history():
    rag.clear_history()
    return {"status": "history cleared"}