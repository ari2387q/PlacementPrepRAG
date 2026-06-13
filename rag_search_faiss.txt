import os
from dotenv import load_dotenv
from backend.src.vectorstore import FaissVectorStore
from backend.src.data_loader import load_all_documents
from langchain_groq import ChatGroq
from langchain_core.messages import HumanMessage, SystemMessage

load_dotenv()

class RAGSearch:
    def __init__(self,persist_dir: str="faiss_store",embedding_model:str="all-MiniLM-L6-v2",llm_model:str="llama-3.1-8b-instant"):
        self.vectorstore=FaissVectorStore(persist_dir="faiss_store")
        faiss_path=os.path.join(persist_dir,"faiss.index")
        meta_path = os.path.join(persist_dir, "metadata.pkl")
        if not (os.path.exists(faiss_path) and os.path.exists(meta_path)):
            docs = load_all_documents("data")
            self.vectorstore.build_from_documents(docs)
        else:
            self.vectorstore.load()
        self.llm = ChatGroq(api_key=os.getenv("GROQ"), model_name=llm_model)
        self.chat_history = []
        print(f"[INFO] RAGSearch initialized with model: {llm_model}")

    def search_and_summarize(self, query: str, top_k: int = 5) -> str:
            results = self.vectorstore.query(query, top_k=top_k)
            texts = [r["metadata"].get("text", "") for r in results if r["metadata"]]
            context = "\n\n".join(texts)
            if not context:
                return "No relevant documents found."
            self.chat_history.append(HumanMessage(content=query))
            messages = [
            SystemMessage(content=f"""You are a placement preparation assistant for CSE students at Indian colleges.

RULES:
1. Answer ONLY what the user asked. Be direct and concise.
2. Primarily use the context provided below.
3. If the context has partial information, use it and mention what you found.
4. Only if the context has absolutely nothing relevant, say: "I don't have specific information about this. Try asking about TCS, Infosys, IBM interviews, HR questions, or NQT papers."
5. Never add unrelated information or make up interview questions.

Context:
{context}

User Question: {query}"""),
            ]
            response = self.llm.invoke(messages)
            self.chat_history.append(response)
            return response.content
    
    def clear_history(self):
        self.chat_history = []
        print("[INFO] Chat history cleared.")