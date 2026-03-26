# RFPinator

A production-grade prototype that ingests security policy documents, answers RFP/security questionnaire prompts with citations via RAG, and evaluates retrieval faithfulness against a golden dataset.

## Architecture

```
apps/
  api/          NestJS backend — ingestion, RAG query, evaluation
  web/          Next.js frontend — upload, review, approve/edit
packages/
  shared/       Shared TypeScript types/contracts
data/           Sample golden dataset
scripts/        Evaluation CLI
```

**Key technologies:** NestJS · Next.js · ChromaDB · LlamaIndex.TS · OpenAI embeddings · Groq/OpenAI LLMs · Tailwind CSS

## Design System

### Color Scheme
- **Primary (Purple)**: #9333ea (brand-600)
  - Light: #a855f7 (brand-500)
  - Dark: #7e22ce (brand-700)
- **Secondary (Yellow)**: #f59e0b (secondary-500)
  - Light: #fcd34d (secondary-300)
  - Dark: #d97706 (secondary-600)
- **Surface Colors**:
  - Background: #faf5ff (surface-muted)
  - Border: #e9d5ff (surface-border)

## Design System

### Color Scheme
- **Primary (Purple)**: #9333ea (brand-600)
  - Light: #a855f7 (brand-500)
  - Dark: #7e22ce (brand-700)
- **Secondary (Yellow)**: #f59e0b (secondary-500)
  - Light: #fcd34d (secondary-300)
  - Dark: #d97706 (secondary-600)
- **Surface Colors**:
  - Background: #faf5ff (surface-muted)
  - Border: #e9d5ff (surface-border)

## Prerequisites

- Node.js ≥ 18.17
- pnpm ≥ 8
- ChromaDB running locally (`docker run -p 8000:8000 chromadb/chroma`)
- Environment variables (see below)

## Environment Variables

Create a `.env` file in the repo root (or export these):

```bash
OPENAI_API_KEY=sk-...          # Required: embeddings + evaluation judge
GROQ_API_KEY=gsk_...           # Required: default answering model
# Optional overrides:
CHROMA_HOST=localhost           # default: localhost
CHROMA_PORT=8000                # default: 8000
CHROMA_COLLECTION=rfpinator_policies
DEFAULT_LLM_PROVIDER=groq      # groq | openai
RAG_TOP_K=5
```

## Quick Start

```bash
# 1. Install dependencies
pnpm install

# 2. Start ChromaDB (if not already running)
docker run -d -p 8000:8000 chromadb/chroma

# 3. Start both frontend and backend in dev mode
pnpm dev
# Or individually:
#   pnpm dev:api   → http://localhost:3001
#   pnpm dev:web   → http://localhost:3000
```

## Usage

1. Open http://localhost:3000
2. Upload source policy documents (PDF or Markdown)
3. Upload a questionnaire file (CSV or Excel .xlsx)
4. Select an answering model (Groq or OpenAI)
5. Click "Generate Answers" to run RAG queries
6. Review, edit, and approve answers in the Results table

## API Endpoints

| Method | Path                  | Description                          |
|--------|-----------------------|--------------------------------------|
| POST   | `/ingestion/upload`   | Upload files (multipart/form-data)   |
| POST   | `/ingestion/directory`| Ingest from server directory path    |
| POST   | `/ingestion/file`     | Ingest single file by server path    |
| POST   | `/query`              | RAG query with structured response   |
| GET    | `/query/providers`    | List available LLM providers         |

## Evaluation

Run the evaluation pipeline against the golden dataset:

```bash
pnpm evaluate                          # Human-readable report
pnpm evaluate -- --json                # JSON output
pnpm evaluate -- --provider openai     # Use specific provider
```

## Development Commands

```bash
pnpm build        # Build all packages
pnpm typecheck    # TypeScript check across monorepo
pnpm lint         # Lint all packages
pnpm test         # Run all tests
pnpm clean        # Clean build artifacts
```
