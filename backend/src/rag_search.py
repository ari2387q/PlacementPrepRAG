import os
from dotenv import load_dotenv
from src.data_loader import load_all_documents
from langchain_groq import ChatGroq
from langchain_core.messages import HumanMessage, SystemMessage
from src.vectorstore import PineconeVectorStore
load_dotenv()

class RAGSearch:
    def __init__(self, embedding_model: str = "all-MiniLM-L6-v2", llm_model: str = "llama-3.1-8b-instant"):
        self.vectorstore = PineconeVectorStore(embedding_model)
        
        if self.vectorstore.is_empty():
            empty = self.vectorstore.is_empty()
            print(f"[DEBUG] Pinecone empty? {empty}")
            if empty:
             print("CWD =", os.getcwd())
             docs = load_all_documents("../data")
             self.vectorstore.build_from_documents(docs)
        else:
            print("[INFO] Pinecone index already has data, skipping build")
        # Load BM25 index from Pinecone chunks
        self.vectorstore.load_bm25_from_pinecone()
        
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