# PlacementPrep AI 🚀

> A production-grade RAG-based placement preparation assistant for CSE students — powered by Hybrid Search, Pinecone, Groq LLM, and a React frontend.

[![Live Demo](https://img.shields.io/badge/Live%20Demo-Vercel-black?style=for-the-badge&logo=vercel)](https://placement-prep-rag.vercel.app)
[![Backend](https://img.shields.io/badge/Backend-Render-46E3B7?style=for-the-badge&logo=render)](https://placementpreprag.onrender.com)
[![Python](https://img.shields.io/badge/Python-3.12-3776AB?style=for-the-badge&logo=python&logoColor=white)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-005571?style=for-the-badge&logo=fastapi)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/React-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev)
[![Pinecone](https://img.shields.io/badge/Pinecone-000000?style=for-the-badge)](https://pinecone.io)

---

## What is PlacementPrep AI?

PlacementPrep AI is an intelligent placement preparation assistant built for CSE students targeting campus placements at companies like TCS, Infosys, and IBM. It uses **Retrieval-Augmented Generation (RAG)** to answer questions strictly from real interview experiences, NQT papers, and HR question banks — not hallucinated content.

Users can also **upload their own PDFs** (company-specific notes, study material, interview experiences) and query them in real-time using the same hybrid search pipeline.

---

## Features

- **Hybrid Search** — combines semantic vector search (Pinecone) with BM25 keyword search for accurate retrieval
- **Reciprocal Rank Fusion (RRF)** — intelligently merges ranked results from both search methods
- **Custom Reranker** — re-scores top candidates using term overlap, bigram matching, and position boosting
- **Source Attribution** — every answer shows which PDF/document it came from
- **Company Metadata Filter** — filters Pinecone search by company when TCS/IBM/Infosys is mentioned
- **Conversation Memory** — session-based chat history (last 6 messages) for contextual follow-ups
- **PDF Upload & Query** — upload any PDF, get a session ID, query it with full hybrid search
- **Session Management** — uploaded document sessions expire after 2 hours, auto-cleaned
- **Dark Theme Chat UI** — React + Vite + TypeScript frontend with code block rendering, copy buttons, and source badges
- **Deployed** — FastAPI on Render, React on Vercel, vectors on Pinecone cloud

---

## Architecture

```
                        ┌─────────────────────────────────────────┐
                        │           React Frontend (Vercel)        │
                        │   Chat UI · File Upload · Source Badges  │
                        └──────────────────┬──────────────────────┘
                                           │ HTTP
                        ┌──────────────────▼──────────────────────┐
                        │          FastAPI Backend (Render)        │
                        │   /query · /upload · /document/query     │
                        └──────────┬───────────────┬──────────────┘
                                   │               │
               ┌───────────────────▼──┐     ┌──────▼──────────────────┐
               │   Permanent RAG      │     │   Session RAG            │
               │   (rag_search.py)    │     │   (temp_vectorstore.py)  │
               │                      │     │                          │
               │  PineconeVectorStore │     │  TempDocStore (RAM)      │
               │  BM25 Index          │     │  BM25 Index              │
               │  RRF Fusion          │     │  RRF Fusion              │
               │  Reranker            │     │  Reranker                │
               └──────────┬───────────┘     └──────────────────────────┘
                          │
               ┌──────────▼───────────┐
               │   Pinecone Cloud     │
               │   230 chunks indexed │
               │   384-dim cosine     │
               └──────────────────────┘
                          │
               ┌──────────▼───────────┐
               │   Groq LLM           │
               │  llama-3.1-8b-instant│
               └──────────────────────┘
```

---

## RAG Pipeline (Detailed)

```
Raw PDFs + TXT files
        ↓
data_loader.py       → recursive PDF/TXT loading with error handling
        ↓
embedding.py         → RecursiveCharacterTextSplitter (1000 tokens, 200 overlap)
                       SentenceTransformer (all-MiniLM-L6-v2) → 384-dim vectors
        ↓
vectorstore.py       → Pinecone upsert with text + source metadata
        ↓
─────────────────── Query Time ───────────────────
        ↓
User Query (plain text)
        ↓
    ┌───┴───────────────────────────┐
    │                               │
Pinecone Vector Search          BM25 Keyword Search
(semantic similarity)           (exact keyword scoring)
top 15 results                  top 15 results
    │                               │
    └───────────┬───────────────────┘
                ↓
    Reciprocal Rank Fusion (k=60)
    combines both ranked lists
                ↓
    Top 15 fused candidates
                ↓
    Custom Reranker
    (term overlap + bigrams + position boost + RRF score)
                ↓
    Top 5 final chunks
                ↓
    Groq LLM (llama-3.1-8b-instant)
    context-grounded answer generation
                ↓
    Answer + Source Attribution
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite + TypeScript + Tailwind CSS |
| Backend | FastAPI + Python 3.12 + Uvicorn |
| Vector DB | Pinecone (Serverless, us-east-1) |
| Embeddings | Sentence Transformers (all-MiniLM-L6-v2) |
| Keyword Search | BM25 (custom implementation) |
| LLM | Groq API (llama-3.1-8b-instant) |
| PDF Loading | LangChain PyPDFLoader |
| Chunking | LangChain RecursiveCharacterTextSplitter |
| Deployment | Render (backend) + Vercel (frontend) |

---

## Project Structure

```
PlacementPrepRAG/
├── backend/
│   ├── src/
│   │   ├── data_loader.py        # recursive PDF/TXT ingestion
│   │   ├── embedding.py          # chunking + embedding pipeline
│   │   ├── vectorstore.py        # Pinecone + BM25 + RRF + reranker
│   │   ├── rag_search.py         # RAG orchestration + conversation memory
│   │   └── temp_vectorstore.py   # in-memory store for uploaded PDFs
│   ├── main.py                   # FastAPI app + all endpoints
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   └── App.tsx               # full chat UI with upload support
│   ├── package.json
│   └── vite.config.ts
├── data/
│   ├── companies/                # TCS, Infosys, IBM interview experiences
│   ├── papers/                   # TCS NQT Papers 1, 2, 3
│   └── hr/                       # HR question banks
└── README.md
```

---

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/` | Health check |
| `POST` | `/query` | Query the permanent RAG (TCS/IBM/Infosys data) |
| `POST` | `/clear` | Clear conversation history |
| `POST` | `/upload` | Upload a PDF, returns `session_id` |
| `POST` | `/document/query` | Query an uploaded PDF by `session_id` |
| `DELETE` | `/document/{session_id}` | Delete an uploaded document session |

### `/query` Request/Response

```json
// Request
{
  "query": "What questions did TCS ask in their NQT paper?",
  "top_k": 5
}

// Response
{
  "answer": "Based on the TCS NQT papers...",
  "sources": ["TCS-NQT-Paper-1.pdf", "tcs.pdf"]
}
```

### `/upload` + `/document/query` Flow

```json
// POST /upload → multipart/form-data with PDF file
{
  "session_id": "abc-123-def-456",
  "filename": "wipro_experience.pdf",
  "chunks": 47
}

// POST /document/query
{
  "session_id": "abc-123-def-456",
  "query": "What rounds did Wipro have?",
  "top_k": 5
}
```

---

## Data Indexed

| Category | Files | Chunks |
|---|---|---|
| Company Interviews | TCS, Infosys, IBM experience PDFs | ~120 |
| NQT Papers | TCS NQT Paper 1, 2, 3 | ~80 |
| HR Questions | Campus placement HR question bank | ~30 |
| **Total** | **7 PDFs** | **230 chunks** |

---

## Key Design Decisions

**Why Hybrid Search over pure vector search?**
Pure vector search misses exact keyword matches. Searching "TCS NQT" might not retrieve NQT paper chunks if the embedding model treats it as noise. BM25 excels at exact matches. RRF combines both — chunks appearing in both ranked lists score higher.

**Why Pinecone over FAISS?**
FAISS stores the index locally — can't deploy without committing binary files to GitHub. Pinecone is cloud-native, persists across deployments, and scales without infrastructure changes.

**Why two vector stores (Pinecone + TempDocStore)?**
Permanent curated data (company interviews, NQT papers) belongs in Pinecone — persists forever, always available. User-uploaded PDFs are temporary — storing them in Pinecone would pollute the index and cost money. TempDocStore uses RAM with a 2-hour TTL, keeping separation clean.

**Why a custom reranker over a cross-encoder?**
Cross-encoders (like `ms-marco-MiniLM`) add another 80MB model and significant latency. For 230 chunks, a custom scorer using term overlap + bigram matching + position boosting gives sufficient improvement without the memory overhead — critical for Render's 512MB RAM limit.

---

## Running Locally

### Prerequisites
- Python 3.12+
- Node.js 18+
- Pinecone account (free tier)
- Groq API key (free tier)

### Backend Setup

```bash
# clone repo
git clone https://github.com/ari2387q/PlacementPrepRAG.git
cd PlacementPrepRAG/backend

# create virtual environment
python -m venv .venv
.venv\Scripts\activate  # Windows
# source .venv/bin/activate  # Mac/Linux

# install dependencies
pip install -r requirements.txt

# create .env file
echo "GROQ=your_groq_api_key" > .env
echo "PINECONE_API_KEY=your_pinecone_api_key" >> .env
echo "PINECONE_INDEX=placement-prep" >> .env

# run backend
uvicorn main:app --reload
```

Backend runs at `http://localhost:8000`
API docs at `http://localhost:8000/docs`

### Frontend Setup

```bash
cd PlacementPrepRAG/frontend

# install dependencies
npm install

# create .env.local
echo "VITE_API_URL=http://localhost:8000" > .env.local

# run frontend
npm run dev
```

Frontend runs at `http://localhost:5173`

---

## Known Limitations

- No authentication — API is publicly accessible
- No file size limit on uploads — large PDFs could exhaust RAM
- Session data lost on server restart (in-memory storage)
- Render free tier has 512MB RAM limit — cold starts take 30-60 seconds
- Only English PDF text extraction supported (no OCR for scanned PDFs)
- Company metadata filter only covers TCS, Infosys, IBM currently

---

## What I Learned Building This

- End-to-end RAG pipeline design from data ingestion to LLM response
- Why hybrid search outperforms pure vector search for domain-specific retrieval
- Reciprocal Rank Fusion as a principled way to merge ranked lists
- Pinecone vs FAISS tradeoffs for deployed applications
- FastAPI lifespan events and why lazy imports matter for deployment
- Session-based temporary document storage without polluting the primary index
- CPU vs GPU torch and why it matters for cloud deployment

---

## Roadmap

- [ ] Add JWT authentication
- [ ] File size validation on upload
- [ ] Streaming LLM responses to frontend
- [ ] Add more company data (Wipro, Amazon, Google, Microsoft)
- [ ] Evaluation harness with RAGAS framework
- [ ] Redis-based session persistence
- [ ] Rate limiting on API endpoints

---

## Author

**Aryan Nair** — BTech CSE @ RIT Kottayam  
GitHub: [@ari2387q](https://github.com/ari2387q)

---

## License

MIT License — feel free to use this as a reference for your own RAG projects.
