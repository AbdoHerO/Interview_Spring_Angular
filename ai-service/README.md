# AI Interview Simulator — Service

A production-grade RAG-powered technical interviewer that plugs into the
existing **Interview Revision Hub** (vanilla JS + PHP) without rewriting any
of it.

```
┌──────────────────┐    cookie-auth    ┌──────────────────┐  shared-secret  ┌──────────────────┐
│  Browser (JS)    │ ────────────────► │  PHP (existing)  │ ──────────────► │  Python AI svc   │
│  js/interview.js │ ◄──────────────── │  ai_proxy.php    │ ◄────────────── │  FastAPI + RAG   │
└──────────────────┘                   └──────────────────┘                  └────────┬─────────┘
                                                                                      │
                                                                          ┌───────────┼────────────┐
                                                                          ▼           ▼            ▼
                                                                      Qdrant    LLM router    Embeddings
                                                                     (vectors)  (OpenAI/      (Voyage /
                                                                                Anthropic/    OpenAI)
                                                                                Groq)
```

## What it does

| Mode | Behaviour |
|------|-----------|
| `technical`        | Adaptive Q&A on Java / Spring / Angular / micro-services. Drills into depth. |
| `project_defense`  | Ingests a Git repo / ZIP / file, builds a vector index + architecture brief, asks **project-specific** questions grounded in the actual code. |
| `hr`               | Behavioural / motivation questions. |
| `coding`           | Bug-fix, algorithm, and optimisation problems. |

Each answer is scored on five axes; difficulty auto-adapts; a final report is
produced with strengths / weaknesses and a hire recommendation.

## Folder layout

```
ai-service/
├── Dockerfile
├── docker-compose.yml          ← Qdrant + AI service
├── requirements.txt
├── .env.example
└── app/
    ├── main.py                 ← FastAPI entry
    ├── config.py               ← typed settings (pydantic)
    ├── deps.py                 ← internal-token auth
    ├── api/
    │   ├── routes_ingest.py    ← POST /api/upload, /api/analyze-repository
    │   └── routes_interview.py ← /api/start-interview, /answer, /interview-state, /score-interview
    ├── core/
    │   ├── llm.py              ← OpenAI / Anthropic / Groq router (chat + JSON + stream)
    │   ├── embeddings.py       ← Voyage code-3 primary, OpenAI fallback
    │   ├── vectorstore.py      ← Qdrant wrapper (async via to_thread)
    │   ├── chunker.py          ← Code-aware semantic chunking + technology detection
    │   └── reranker.py         ← BM25 + filename/tech boost on top of cosine
    ├── services/
    │   ├── ingest.py           ← file/zip/repo → parse → chunk → embed → upsert + brief
    │   ├── interview_engine.py ← Question generation + RAG context + adaptive difficulty
    │   ├── scoring.py          ← Per-turn JSON eval + final report
    │   └── session_store.py    ← Pluggable (JSON default; Redis-ready)
    ├── prompts/                ← All system prompts in one place
    ├── models/schemas.py       ← Pydantic API contracts
    └── utils/                  ← Parsing (PDF/DOCX/text), GitHub clone, tokens
```

## Quick start (Docker)

```bash
cd ai-service
cp .env.example .env             # fill in API keys + a strong INTERNAL_SHARED_SECRET
docker compose up -d --build
curl -H "X-Internal-Token: $INTERNAL_SHARED_SECRET" http://localhost:8088/healthz
```

Then in the project root, add to your existing `.env` (next to `api.php`):

```
AI_SERVICE_URL=http://localhost:8088
INTERNAL_SHARED_SECRET=...same-value-as-in-ai-service/.env...
```

Reload the browser app. A new **AI Interview** group appears in the sidebar.

## API contracts (called via `ai_proxy.php`)

All requests carry the existing PHP session cookie; the proxy adds
`X-Internal-Token`. The Python service refuses any request without it.

| Browser action                    | Upstream                          |
|-----------------------------------|------------------------------------|
| `ai_proxy.php?action=health`              | `GET  /healthz`                  |
| `ai_proxy.php?action=upload` (multipart)  | `POST /api/upload`               |
| `ai_proxy.php?action=analyze-repository`  | `POST /api/analyze-repository`   |
| `ai_proxy.php?action=start-interview`     | `POST /api/start-interview`      |
| `ai_proxy.php?action=answer`              | `POST /api/answer`               |
| `ai_proxy.php?action=interview-state`     | `GET  /api/interview-state`      |
| `ai_proxy.php?action=score-interview`     | `POST /api/score-interview`      |

### Scoring payload

```json
{
  "technical_accuracy": 8,
  "clarity":            7,
  "depth":              9,
  "best_practices":     8,
  "confidence":         6,
  "final_score":        7.6,
  "strengths":          ["..."],
  "weaknesses":         ["..."],
  "recommendation":     "hire"
}
```

## RAG details

- **Chunker** (`core/chunker.py`)
  - Code: top-level structural split (class / interface / decorated method)
    then token-packed windows with overlap.
  - Markdown: heading-based split.
  - Each chunk carries `{source_id, filename, language, file_type, technology,
    technologies_all, section, repo?}`.
- **Embeddings**: `voyage-code-3` (1024-dim, code-optimised) → fallback
  `text-embedding-3-small`.
- **Vector DB**: Qdrant, cosine distance, payload indexes on
  `source_id / technology / file_type / language / filename` for fast filtered
  search.
- **Retrieval**: similarity top-k → BM25 keyword rerank → tech / filename
  boost → top-N kept.
- **Context compression**: only the reranked top-N are injected, each capped
  to ~1.2k chars.
- **Repo brief**: a one-page architecture brief is generated at ingest time
  (preferring Claude for long context) and stored as `file_type=brief` chunks
  so it's retrievable later as RAG context.

## Interview engine details

- **State** is durable per `session_id` (JSON file by default — works on
  shared hosting; Redis backend is wired but optional).
- **Adaptive difficulty**: rolling average of `technical_accuracy + depth`
  over the last 3 turns moves difficulty up/down.
- **No repeats**: last 8 asked questions are passed into the prompt.
- **Project defense**: each new question retrieves fresh RAG context using
  the candidate's latest answer as the query, so questions actually probe
  the project.

## Security

- Python service is reachable **only** with `X-Internal-Token`.
- PHP proxy enforces the existing session auth before forwarding.
- ZIP extraction rejects absolute paths and `..` traversal.
- Git clone only accepts `http(s)://` URLs and is shallow + single-branch.
- File-size caps (`MAX_UPLOAD_MB`, `MAX_REPO_FILES`, `MAX_REPO_BYTES`).
- LLM JSON parsing is sandboxed (`_safe_json`) — no `eval`.
- CORS restricted via `ALLOWED_ORIGINS` in `.env`.

## Cost optimisation

- Code-aware chunking → fewer, more meaningful chunks.
- Reranker is dependency-free (no second model call).
- Only top-N reranked chunks reach the LLM.
- Token-bounded context windows everywhere; transcript trimmed to last 6 turns.
- Cheaper provider fallback (Groq Llama 4 Scout) when primary is unavailable.
- One-time brief generation per source amortises analysis cost across many
  interview turns.

## Production checklist

- [ ] Set strong `INTERNAL_SHARED_SECRET` (≥32 random chars) in both `.env` files.
- [ ] Run the Python service behind a private network (do not expose 8088 publicly).
- [ ] Restrict `ALLOWED_ORIGINS` to your PHP host.
- [ ] Put Qdrant on a persistent volume (already configured in compose).
- [ ] Configure log rotation for `loguru` if running long-lived.
- [ ] Provide at least one of: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GROQ_API_KEY`.
- [ ] Provide at least one of: `VOYAGE_API_KEY` or `OPENAI_API_KEY` for embeddings.

## Local dev (no Docker)

```bash
cd ai-service
python -m venv .venv && . .venv/Scripts/activate   # Windows
pip install -r requirements.txt
cp .env.example .env
# Run a local Qdrant (e.g. via docker run -p 6333:6333 qdrant/qdrant)
uvicorn app.main:app --reload --port 8088
```
