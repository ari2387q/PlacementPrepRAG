import os
from typing import Any

mongo_client: Any = None
db: Any = None
chat_collection: Any = None
integration_collection: Any = None


def init_db(mongo_uri: str | None = None) -> None:
    global mongo_client, db, chat_collection, integration_collection
    uri = mongo_uri or os.getenv("MONGODB_URI", "")
    if uri:
        try:
            from pymongo import MongoClient
            mongo_client = MongoClient(uri, serverSelectionTimeoutMS=5000)
            db = mongo_client["placement_prep"]
            chat_collection = db["chat_history"]
            integration_collection = db["integrations"]
            print("[INFO] Connected to MongoDB")
        except Exception as e:  # noqa: BLE001
            print(f"[ERROR] Failed to connect to MongoDB ({type(e).__name__})")
            mongo_client = None
    else:
        print("[WARN] MONGODB_URI not set. Chat history will not be persisted to MongoDB.")


def close_db() -> None:
    global mongo_client
    if mongo_client:
        mongo_client.close()
        mongo_client = None
