import re

STOP = {"a", "an", "the", "is", "are", "was", "were", "of", "in", "on", "at",
        "to", "for", "with", "and", "or", "but", "this", "that", "by", "as"}

def tokenize(text):
    return [t for t in re.findall(r"[a-z0-9]+", text.lower()) if t not in STOP]

def split_sentences(text):
    return [s.strip() for s in re.split(r"(?<=[.!?])\s+", text) if s.strip()]

def faithfulness(answer, context):
    context_set = set(tokenize(context))
    claims = split_sentences(answer)
    if not claims:
        return 0.0
    supported = 0
    for claim in claims:
        claim_tokens = tokenize(claim)
        if not claim_tokens:
            continue
        overlap = sum(1 for t in claim_tokens if t in context_set)
        if overlap / len(claim_tokens) >= 0.5:
            supported += 1
    return supported / len(claims)

def answer_relevance(question, answer):
    q_tokens = set(tokenize(question))
    a_tokens = set(tokenize(answer))
    if not q_tokens or not a_tokens:
        return 0.0
    overlap = len(q_tokens & a_tokens)
    return round(overlap / len(q_tokens), 2)

def evaluate_rag_resp(question: str, answer: str, contexts: list[str]) -> dict:
    """
    Evaluates the RAG response using zero-memory lexical overlap metrics.
    """
    ctx_joined = " ".join(contexts)
    f_score = faithfulness(answer, ctx_joined)
    r_score = answer_relevance(question, answer)
    
    return {
        "faithfulness": round(f_score, 2),
        "answer_relevance": round(r_score, 2)
    }
