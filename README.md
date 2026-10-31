# MartonToolBox

MartonToolBox is a privacy-friendly collection of business utilities built as a modular ASP.NET Core API and Angular application. The first release includes a dashboard, authentication foundation, tool registry, CSV Cleaner, Image Resizer, PDF Toolkit, and Document Converter.

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

The refresh endpoint is deliberately an architecture placeholder; production refresh-token persistence, email verification, and password reset delivery need their own secure storage/provider configuration.
