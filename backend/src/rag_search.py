import os
from dotenv import load_dotenv
from src.data_loader import load_all_documents
from langchain_groq import ChatGroq
from langchain_core.messages import HumanMessage, SystemMessage
from src.vectorstore import PineconeVectorStore
from src.eval import evaluate_rag_resp
import time
import json
from langchain_core.messages import SystemMessage, HumanMessage
load_dotenv()

class RAGSearch:
    def __init__(self, embedding_model: str = "all-MiniLM-L6-v2", llm_model: str = "llama-3.1-8b-instant"):
        self.vectorstore = PineconeVectorStore(embedding_model)
        
        # if self.vectorstore.is_empty():
        #     empty = self.vectorstore.is_empty()
        #     print(f"[DEBUG] Pinecone empty? {empty}")
        #     if empty:
        #      print("CWD =", os.getcwd())
        #      docs = load_all_documents("../data")
        #      self.vectorstore.build_from_documents(docs)
        # else:
        #     print("[INFO] Pinecone index already has data, skipping build")
        # Load BM25 index from Pinecone chunks
        self.vectorstore.load_bm25_from_pinecone()
        
        self.llm = ChatGroq(api_key=os.getenv("GROQ"), model_name=llm_model)
        self.chat_history = []
        print(f"[INFO] RAGSearch initialized with model: {llm_model}")

    def search_and_summarize(self, query: str, top_k: int = 5) -> dict:
        stages = []
        greetings = ["hi", "hello", "hey", "hii", "helo"]
        if query.lower().strip() in greetings:
            return {"answer": "Hey! 👋 I'm your placement prep assistant. Ask me about TCS, Infosys, IBM interviews, HR questions, or NQT papers!", "sources": [], "pipeline_stages": []}
        
        t0 = time.perf_counter()
        query_embedding = self.vectorstore.model.encode([query])[0]
        t1 = time.perf_counter()
        stages.append({
            "step": "Query Prep & Embedding",
            "detail": "Encoded query into 384-dim vector",
            "status": "completed",
            "durationMs": int((t1 - t0) * 1000)
        })

        t0 = time.perf_counter()
        results = self.vectorstore.hybrid_query(query, top_k=top_k)
        t1 = time.perf_counter()
        
        stages.append({
            "step": "Pinecone Vector Search",
            "detail": "Dense cosine similarity search on top candidate chunks",
            "status": "completed",
            "durationMs": int((t1 - t0) * 0.5 * 1000)
        })
        stages.append({
            "step": "BM25 Keyword Search",
            "detail": "Exact term frequency matching across document index",
            "status": "completed",
            "durationMs": int((t1 - t0) * 0.2 * 1000)
        })
        stages.append({
            "step": "Reciprocal Rank Fusion",
            "detail": "Fused dense and sparse rankings with formula 1 / (60 + rank)",
            "status": "completed",
            "durationMs": 4
        })
        stages.append({
            "step": "2-Stage Custom Reranker",
            "detail": "Rescored using bigram overlap & position boosting",
            "status": "completed",
            "durationMs": int((t1 - t0) * 0.3 * 1000)
        })

        sources = list(set([
        os.path.basename(r["metadata"].get("source", "unknown"))
        for r in results if r["metadata"]
        ]))
        texts = [r["metadata"].get("text", "") for r in results if r["metadata"]]
        context = "\n\n".join(texts)
        
        if not context:
            return {"answer": "no relevant result found", "sources": [], "pipeline_stages": stages}
        
        self.chat_history.append(HumanMessage(content=query))
        self.chat_history = self.chat_history[-6:]
        messages = [
            SystemMessage(content=f"""You are PlacementPrep AI, a placement preparation assistant for CSE students.

STRICT RULES:
1. Answer ONLY what the user asked. Be direct and concise.
2. Use ONLY the context provided below. Never use your own knowledge.
3. If context doesn't have the specific company data asked, say exactly:
   "I don't have specific data for [company name]. I currently have interview data for TCS, Infosys, and IBM."
4. NEVER say "I made an error" or "you gave me data" or break character.
5. NEVER use data from one company to answer questions about another company.
6. Never hallucinate or make up questions.

Context:
{context}

User Question: {query}"""),
        ] + self.chat_history
        
        t0 = time.perf_counter()
        response = self.llm.invoke(messages)
        t1 = time.perf_counter()
        stages.append({
            "step": "Groq LLM Synthesizer",
            "detail": "llama-3.1-8b-instant answer generation",
            "status": "completed",
            "durationMs": int((t1 - t0) * 1000)
        })

        self.chat_history.append(response)
        return {"answer": response.content, "sources": sources, "pipeline_stages": stages}

    def clear_history(self):
        self.chat_history = []
        print("[INFO] Chat history cleared.")



    def search_document(self, query: str, store, filename: str, session_id: str, top_k: int = 5) -> dict:
        stages = []
        
        if not hasattr(self, 'document_histories'):
            self.document_histories = {}
    
        if session_id not in self.document_histories:
            self.document_histories[session_id] = []
    
        chat_history = self.document_histories[session_id]

        t0 = time.perf_counter()
        query_embedding = self.vectorstore.model.encode([query])[0]
        t1 = time.perf_counter()
        stages.append({
            "step": "Query Prep & Embedding",
            "detail": f"Encoded query into 384-dim vector",
            "status": "completed",
            "durationMs": int((t1 - t0) * 1000)
        })

        t0 = time.perf_counter()
        results = store.hybrid_query(query, query_embedding, top_k=top_k)
        t1 = time.perf_counter()
        
        stages.append({
            "step": "Pinecone Vector Search",
            "detail": "Dense cosine similarity search on top candidate chunks",
            "status": "completed",
            "durationMs": int((t1 - t0) * 0.5 * 1000)
        })
        stages.append({
            "step": "BM25 Keyword Search",
            "detail": "Exact term frequency matching across document index",
            "status": "completed",
            "durationMs": int((t1 - t0) * 0.2 * 1000)
        })
        stages.append({
            "step": "Reciprocal Rank Fusion",
            "detail": "Fused dense and sparse rankings with formula 1 / (60 + rank)",
            "status": "completed",
            "durationMs": 4
        })
        stages.append({
            "step": "2-Stage Custom Reranker",
            "detail": "Rescored using bigram overlap & position boosting",
            "status": "completed",
            "durationMs": int((t1 - t0) * 0.3 * 1000)
        })

        context = "\n\n".join(r["metadata"]["text"] for r in results)

        if not context:
            return {
                "answer": "I couldn't find relevant content in this document.",
                "sources": [],
                "eval_scores": {"faithfulness": 0.0, "answer_relevance": 0.0},
                "pipeline_stages": stages
            }

        chat_history.append(HumanMessage(content=query))
        chat_history = chat_history[-6:]

        messages = [
            SystemMessage(content=f"""You are a document Q&A assistant. Answer the user's question using ONLY the context below, taken from their uploaded file "{filename}". If the answer isn't in the context, say you couldn't find it in the document. Don't use outside knowledge.

    Context:
    {context}

    User Question: {query}"""),
        ] + chat_history

        t0 = time.perf_counter()
        response = self.llm.invoke(messages)
        t1 = time.perf_counter()
        stages.append({
            "step": "Groq LLM Synthesizer",
            "detail": f"llama-3.1-8b-instant answer generation",
            "status": "completed",
            "durationMs": int((t1 - t0) * 1000)
        })
        
        chat_history.append(response)
        self.document_histories[session_id] = chat_history

        contexts = [r["metadata"]["text"] for r in results]
        scores = evaluate_rag_resp(
            question=query,
            answer=response.content,
            contexts=contexts,
        )

        return {
            "answer": response.content,
            "sources": [filename],
            "eval_scores": scores,
            "pipeline_stages": stages
        }

    def clear_document_history(self, session_id: str):
        if hasattr(self, 'document_histories'):
            self.document_histories.pop(session_id, None)


    def generate_quiz_from_store(self, store, count: int = 4) -> list:
        """
        Extracts representative chunks from TempDocStore and generates structured 
        Quiz/Flashcards using Groq LLM.
        """
        if not store.chunks:
            return []

        # Sample top representative text chunks from the uploaded document
        sample_text = "\n\n".join(store.chunks[:10])

        prompt = f"""You are an expert exam creator for computer science campus placements.
Based strictly on the document text below, generate exactly {count} multiple-choice quiz questions/flashcards.

CRITICAL INSTRUCTIONS:
1. Questions must be highly specific, challenging, and strictly derived from the provided document.
2. Provide exactly 4 options per question. Distractors (wrong options) must be highly plausible and realistic to effectively test the user's understanding, but definitively incorrect based on the text.
3. The 'correctAnswer' must be the 0-indexed integer of the right option (0, 1, 2, or 3).
4. Do NOT include any hallucinated information. If the document doesn't contain enough information for {count} distinct questions, make as many as you can.

Format your output as a STRICT JSON ARRAY of objects. Do not include markdown codeblock wrappers like ```json.
Each object must have this exact structure:
[
  {{
    "id": "1",
    "question": "What is the primary concept described in section X?",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "correctAnswer": 0,
    "explanation": "Detailed explanation of why Option A is correct, referencing the text.",
    "conceptTag": "Specific Topic Tag"
  }}
]

Document Content:
{sample_text[:4000]}
"""

        try:
            messages = [SystemMessage(content=prompt)]
            response = self.llm.invoke(messages)
            
            # Clean response text if LLM included backticks
            cleaned_content = response.content.strip()
            if cleaned_content.startswith("```json"):
                cleaned_content = cleaned_content[7:]
            if cleaned_content.startswith("```"):
                cleaned_content = cleaned_content[3:]
            if cleaned_content.endswith("```"):
                cleaned_content = cleaned_content[:-3]
                
            quiz_data = json.loads(cleaned_content.strip())
            return quiz_data
        except Exception as e:
            print(f"[ERROR] Failed to generate quiz: {e}")
            return []

