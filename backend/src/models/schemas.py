from pydantic import BaseModel, Field


class QueryRequest(BaseModel):
    query: str
    top_k: int = 3


class ClearRequest(BaseModel):
    pass


class HistorySyncRequest(BaseModel):
    messages: list[dict]
    email: str | None = None


class DocumentQueryRequest(BaseModel):
    session_id: str
    query: str
    top_k: int = 3


class QuizRequest(BaseModel):
    session_id: str
    count: int = Field(default=4, ge=1, le=12)


class ResumeScoreRequest(BaseModel):
    session_id: str = Field(min_length=1, max_length=120)
    target_role: str = Field(default="Software Development Engineer", max_length=100)


class GoogleAuthRequest(BaseModel):
    id_token: str = Field(min_length=20, max_length=10000)


class LeetCodeManualStats(BaseModel):
    profile_url: str = Field(min_length=1, max_length=300)
    easy: int = Field(default=0, ge=0, le=100000)
    medium: int = Field(default=0, ge=0, le=100000)
    hard: int = Field(default=0, ge=0, le=100000)
    topics: dict[str, int] = Field(default_factory=dict)
    daily_solves: dict[str, int] = Field(default_factory=dict)
