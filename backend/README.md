# MartonToolBox Backend

ASP.NET Core 8 API following a Clean Architecture layout.

## Projects

- `MartonToolBox.Domain` — entities and license domain types.
- `MartonToolBox.Application` — use-case contracts, DTOs, and payment/license abstractions.
- `MartonToolBox.Infrastructure` — EF Core/PostgreSQL, ASP.NET Identity, CSV service, fake payment provider.
- `MartonToolBox.Api` — REST API, JWT issuance, OpenAPI, CORS, rate-limit policy, security headers, tool seed data.
- `MartonToolBox.Tests` — unit tests.

## Controllers

- `AuthController` — `/api/auth/register`, `/api/auth/login`, `/api/auth/refresh`
- `AccountController` — `/api/account` (JWT required)
- `ToolsController` — `/api/tools`, `/api/tools/{slug}`
- `CsvController` — `/api/csv/preview`, `/api/csv/process`

## Run locally

Requires .NET 8 SDK and a reachable PostgreSQL instance (`docker compose up -d postgres` from the repo root gives you one on `localhost:5433`).

```bash
dotnet restore MartonToolBox.sln
dotnet run --project MartonToolBox.Api
```

Provide `ConnectionStrings__Postgres` and `Jwt__Key` as environment variables (see the root `.env.example`). The API applies its checked-in EF Core migration automatically against an empty database.

## Tests

```bash
dotnet test MartonToolBox.sln
```

## Migrations

```bash
dotnet tool run dotnet-ef migrations add <MigrationName> --project MartonToolBox.Infrastructure --startup-project MartonToolBox.Api
```
