import os
from fastapi import FastAPI,UploadFile,File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from contextlib import asynccontextmanager
from datetime import datetime,timedelta
import tempfile
import uuid
from langchain_core.messages import SystemMessage
from src.temp_vectorstore import TempDocStore
from src.eval import evaluate_rag_resp

rag=None
document_sessions: dict={}
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
    now=datetime.utcnow()
    expired=[sid for sid,data in document_sessions.items() if now - data["created_at"] > SESSION_TTL]
    for sid in expired:
        del document_sessions[sid]
#for pinecone (v1)
class QueryRequest(BaseModel):
    query:str
    top_k: int=5
#a new class
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
    return {"answer": results["answer"],"sources": results["sources"]}

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
        "created_at": datetime.utcnow(),
        "filename": file.filename,
    }

    return {"session_id": session_id, "filename": file.filename, "chunks": chunk_count}
@app.post("/document/query")
def query_document(request:DocumentQueryRequest):
    session=document_sessions.get(request.session_id)
    if not session:
        return{"error":"session not dounf or expired"}
    
    store:TempDocStore=session["store"]
    query_embedding=rag.vectorstore.model.encode([request.query])[0]

    results = store.hybrid_query(request.query, query_embedding, top_k=request.top_k)
    context = "\n\n".join(r["metadata"]["text"] for r in results)

    if not context:
        return {"answer": "I couldn't find relevant content in this document for that question.", "sources": []}

    messages = [
        SystemMessage(content=f"""You are a document Q&A 
                      assistant. Answer the user's question using ONLY the context below, taken from 
                      their uploaded file "{session['filename']}". If 
                      the answer isn't in the context, 
                      say you couldn't find it in the document. 
                      Don't use outside knowledge.

Context:
{context}

User Question: {request.query}"""),
    ]
    response = rag.llm.invoke(messages)
    answer = response.content

    contexts = [
    r["metadata"]["text"]
    for r in results
    ]

    scores = evaluate_rag_resp(
        question=request.query,
        answer=answer,
        contexts=contexts,
    )

    return {
        "answer": answer,
        "sources": [session["filename"]],
        "eval_scores": scores
    }
@app.delete("/document/{session_id}")
def delete_document_session(session_id:str):
    document_sessions.pop(session_id,None)
    return {"status":"session cleared"}

