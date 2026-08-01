import os
from fastapi import FastAPI,UploadFile,File,HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from contextlib import asynccontextmanager
from datetime import datetime,timedelta,timezone
import tempfile
import uuid
from langchain_core.messages import SystemMessage
from src.temp_vectorstore import TempDocStore


rag=None
document_sessions: dict={}
document_chat_histories: dict = {}
SESSION_TTL=timedelta(hours=2)

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
#for session storage expiration clearage
def cleanup_expired_sessions():
    now=datetime.now(timezone.utc)
    expired=[sid for sid,data in document_sessions.items() if now - data["created_at"] > SESSION_TTL]
    for sid in expired:
        del document_sessions[sid]
#for pinecone (v1)
class QueryRequest(BaseModel):
    query:str
    top_k: int=5
#a new classa
class DocumentQueryRequest(BaseModel):
    session_id: str
    query: str
    top_k: int = 5
#below 3 functions remain same
@app.get("/")
def health():
    return {"status": "ok"}
#for the pinecone (v1)
@app.post("/query")
def query(request: QueryRequest):
    results = rag.search_and_summarize(request.query, request.top_k)
    return {"answer": results["answer"], "sources": results["sources"], "pipeline_stages": results.get("pipeline_stages", [])}

@app.post("/clear")
def clear_history():
    rag.clear_history()
    return {"status": "history cleared"}

@app.post("/upload")
async def upload_pdf(file: UploadFile = File(...)):
    cleanup_expired_sessions()

    if not file.filename.lower().endswith(".pdf"):
        return {"error": "Only PDF files are supported"}

    store = TempDocStore()
    chunk_count = await store.build_from_file(file, rag.vectorstore.model)

    if chunk_count == 0:
        return {"error": "Couldn't extract any text from this PDF"}

    session_id = str(uuid.uuid4())
    document_sessions[session_id] = {
        "store": store,
        "created_at": datetime.now(timezone.utc),
        "filename": file.filename,
    }

    return {"session_id": session_id, "filename": file.filename, "chunks": chunk_count}
@app.post("/document/query")
def query_document(request: DocumentQueryRequest):
    session = document_sessions.get(request.session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found or expired")

    result = rag.search_document(
        query=request.query,
        store=session["store"],
        filename=session["filename"],
        session_id=request.session_id,
        top_k=request.top_k
    )
    return result
@app.delete("/document/{session_id}")
def delete_document_session(session_id:str):
    document_sessions.pop(session_id,None)
    rag.clear_document_history(session_id)
    return {"status":"session cleared"}

class QuizRequest(BaseModel):
    session_id: str
    count: int = 4

@app.post("/document/generate-quiz")
def generate_quiz(request: QuizRequest):
    session = document_sessions.get(request.session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found or expired")
    
    quiz_items = rag.generate_quiz_from_store(session["store"], count=request.count)
    return {"quiz_items": quiz_items}
