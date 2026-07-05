import os
from dotenv import load_dotenv
from src.data_loader import load_all_documents
from langchain_groq import ChatGroq
from langchain_core.messages import HumanMessage, SystemMessage
from src.vectorstore import PineconeVectorStore
from src.eval import evaluate_rag_resp
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
        # self.vectorstore.load_bm25_from_pinecone()
        
        self.llm = ChatGroq(api_key=os.getenv("GROQ"), model_name=llm_model)
        self.chat_history = []
        print(f"[INFO] RAGSearch initialized with model: {llm_model}")

    def search_and_summarize(self, query: str, top_k: int = 5) -> str:
        greetings = ["hi", "hello", "hey", "hii", "helo"]
        if query.lower().strip() in greetings:
            return {"answer": "Hey! 👋 I'm your placement prep assistant. Ask me about TCS, Infosys, IBM interviews, HR questions, or NQT papers!", "sources": []}
        
        results = self.vectorstore.hybrid_query(query, top_k=top_k)
        sources = list(set([
        os.path.basename(r["metadata"].get("source", "unknown"))
        for r in results if r["metadata"]
        ]))
        texts = [r["metadata"].get("text", "") for r in results if r["metadata"]]
        context = "\n\n".join(texts)
        
        if not context:
            return {"answer": "no relevant result found", "sources":[]}
        
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
        
        response = self.llm.invoke(messages)
        self.chat_history.append(response)
        return {"answer": response.content, "sources": sources}

    def clear_history(self):
        self.chat_history = []
        print("[INFO] Chat history cleared.")



    def search_document(self, query: str, store, filename: str, session_id: str, top_k: int = 5) -> dict:
    # get or create chat history for this session
        if not hasattr(self, 'document_histories'):
            self.document_histories = {}
    
        if session_id not in self.document_histories:
            self.document_histories[session_id] = []
    
        chat_history = self.document_histories[session_id]

    # get query embedding
        query_embedding = self.vectorstore.model.encode([query])[0]

    # hybrid search on uploaded PDF
        results = store.hybrid_query(query, query_embedding, top_k=top_k)
        context = "\n\n".join(r["metadata"]["text"] for r in results)

        if not context:
            return {
            "answer": "I couldn't find relevant content in this document.",
            "sources": [],
            "eval_scores": {"faithfulness": 0.0, "answer_relevance": 0.0}
        }

    # build messages with history
        chat_history.append(HumanMessage(content=query))
        chat_history = chat_history[-6:]

        messages = [
        SystemMessage(content=f"""You are a document Q&A assistant. Answer the user's question using ONLY the context below, taken from their uploaded file "{filename}". If the answer isn't in the context, say you couldn't find it in the document. Don't use outside knowledge.

    Context:
    {context}

    User Question: {query}"""),
    ] + chat_history

        response = self.llm.invoke(messages)
        chat_history.append(response)
        self.document_histories[session_id] = chat_history

    # eval
        contexts = [r["metadata"]["text"] for r in results]
        scores = evaluate_rag_resp(
        question=query,
        answer=response.content,
        contexts=contexts,
    )

        return {
        "answer": response.content,
        "sources": [filename],
        "eval_scores": scores
    }

    def clear_document_history(self, session_id: str):
        if hasattr(self, 'document_histories'):
            self.document_histories.pop(session_id, None)