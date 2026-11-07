# MartonToolBox

MartonToolBox is a privacy-friendly collection of business utilities built as a modular ASP.NET Core API and Angular application. The first release includes a dashboard, authentication foundation, tool registry, CSV Cleaner, Image Resizer, PDF Toolkit, Document Converter, and AI Assistant.

## Quick start

1. Copy `.env.example` to `.env` and replace the development passwords and JWT key.
2. Run `docker compose up --build`.
3. Open [http://localhost:4200](http://localhost:4200). The API and Swagger UI are available at [http://localhost:8080/swagger](http://localhost:8080/swagger) in development.

## Local development

Prerequisites: .NET 8 SDK, Node 22+ (Node 26 also works for installing dependencies), Docker, and PostgreSQL 16.

```bash
dotnet restore MartonToolBox.sln
dotnet test MartonToolBox.sln
cd frontend/marton-toolbox && npm install && npm start
```

Start the API separately with `dotnet run --project backend/MartonToolBox.Api` after providing `ConnectionStrings__Postgres` and `Jwt__Key` environment variables. The API applies its checked-in EF Core migration when connected to an empty database. Create future migrations with `dotnet tool run dotnet-ef migrations add <MigrationName> --project backend/MartonToolBox.Infrastructure --startup-project backend/MartonToolBox.Api`.

### Run from VS Code

Start the Docker database first with `docker compose up -d postgres`. In VS Code, open the repository folder, select **Run and Debug**, then choose **Debug MartonToolBox** and press F5. This starts the API on port 8080 with the Docker PostgreSQL connection (`localhost:5433`), starts Angular on port 4200, and opens the browser.

## AI Assistant (local LLM in Docker)

The AI Assistant chats with a model served by [llama.cpp](https://github.com/ggml-org/llama.cpp)'s `llama-server`, running as the `llm` service in `docker-compose.yml`. It speaks the OpenAI-compatible API; the backend calls it, the browser never does. The first start downloads the model from Hugging Face into the `llm-models` volume.

```bash
docker compose up -d llm                 # CPU (Mac, or a server without GPU)
docker compose -f docker-compose.yml -f docker-compose.gpu.yml up -d   # NVIDIA GPU
docker compose logs -f llm               # download / loading progress
curl http://localhost:8081/health        # {"status":"ok"} when ready
```

- **Mac:** Docker can't use the Apple GPU, so the model runs on the CPU (slower). Give Docker Desktop at least 6 GB of memory (Settings → Resources).
- **Windows 10/11 Pro server:** install the NVIDIA driver and Docker Desktop (WSL2 backend), then use the GPU command above. Docker Desktop only starts after a user logs in, so set up automatic login for unattended restarts.
- The port is bound to `127.0.0.1` only. To require a key anyway, set `LLM_API_KEY` (compose passes it to both the server and the backend).

**Compose settings** (`.env` next to `docker-compose.yml`)

| Variable | Default | Meaning |
|---|---|---|
| `LLM_HF_MODEL` | `Qwen/Qwen3-4B-GGUF:Q4_K_M` | Hugging Face GGUF repo and quantization, e.g. `Qwen/Qwen3-14B-GGUF:Q4_K_M` for a 16 GB+ GPU |
| `LLM_MODEL` | `qwen3-4b` | Name the server reports; the backend uses the same variable |
| `LLM_CONTEXT` | `8192` | Context tokens, shared by all parallel chats (use `LLM_PARALLEL × 8192`) |
| `LLM_PARALLEL` | `1` | Chats answered at the same time (e.g. `4` on a GPU server) |
| `LLM_API_KEY` | empty | Optional Bearer key |

**Backend settings** (`appsettings.json` → `Llm`): `BaseUrl` (`http://localhost:8081` for `./start.sh`, `http://llm:8080` inside compose), `Model`, `Think` (`false` skips Qwen3's reasoning for faster replies; empty for models without that switch), `ApiKey`, `SystemPrompt`. Any OpenAI-compatible server works (vLLM, LM Studio, a hosted API).

**Daily limits and AI packs** (`appsettings.json` → `AiQuota`): usage is measured in tokens (prompt + reply, as llama.cpp reports them at the end of each reply; a reply stopped half way is estimated at about 4 characters per token), but users only ever see a percentage. Every licensed user gets `BasicDailyTokens` (default 25,000) per rolling 24 hours; nothing counts until the model starts answering. Users can buy a bigger pack on the AI Assistant page (`Packs`: `Id`, `Name`, `DailyTokens`, `Days`, `Price`; default Plus 125,000 and Pro 500,000 for 30 days, shown as "5×" and "20×" the Basic allowance, in `Currency`, default RON). Payment goes through PayU like the shop, and PayU returns the buyer to `/tools/ai-assistant?aiOrder=…`, where the pack is confirmed and switched on. A pack's terms are saved with its order, so later changes don't affect it. Buying the pack you already have adds its days after the current ones. The page shows a live progress bar and, near or at the limit, when the allowance frees up.

## Architecture

- `backend/MartonToolBox.Domain`: entities and license domain types.
- `backend/MartonToolBox.Application`: use-case contracts, DTOs, and payment/license abstractions.
- `backend/MartonToolBox.Infrastructure`: EF Core/PostgreSQL, ASP.NET Identity, CSV service, and fake payment provider.
- `backend/MartonToolBox.Api`: REST API, JWT issuance, OpenAPI, CORS, rate-limit policy, security headers, and tool seed data.
- `frontend/marton-toolbox`: standalone Angular routes and browser-side utility features.

Files are processed locally in the browser for all three implemented tools. The CSV API supports a server-side route for future large-file processing but the user interface intentionally avoids uploading the file.

## API

- `GET /api/tools` and `GET /api/tools/{slug}`
- `POST /api/auth/register`, `/api/auth/login`, `/api/auth/refresh`
- `GET /api/account` (JWT required)
- `POST /api/csv/preview`, `/api/csv/process` (CSV form file, maximum 10 MB)
- `GET /api/ai/status`, `POST /api/ai/chat` (license required; the chat reply streams as plain text)
- `GET /api/ai/usage` (percent of today's allowance used, and the packs), `POST /api/ai/packs/{packId}/checkout`, `POST /api/ai/packs/orders/{orderId}/confirm`; the chat answers 429 with `code: "ai_limit"` once the limit is reached

The refresh endpoint is deliberately an architecture placeholder; production refresh-token persistence, email verification, and password reset delivery need their own secure storage/provider configuration.
