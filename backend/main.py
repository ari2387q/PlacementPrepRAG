from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from src.rag_search import RAGSearch

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

rag = None

class QueryRequest(BaseModel):
    query: str
    top_k: int = 5

@app.on_event("startup")
async def startup_event():
    global rag
    rag = RAGSearch()

@app.get("/")
def health():
    return {"status": "ok"}

@app.post("/query")
def query(request: QueryRequest):
    answer = rag.search_and_summarize(request.query, request.top_k)
    return {"answer": answer}

@app.post("/clear")
def clear_history():
    rag.clear_history()
    return {"status": "history cleared"}