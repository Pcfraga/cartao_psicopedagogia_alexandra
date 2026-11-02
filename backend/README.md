# Backend API (.NET 10)

ASP.NET Core Web API (`src/Cartao.Api`) + EF Core/PostgreSQL + Firebase ID token auth.

## Configuration

| Key (env var) | Description |
| --- | --- |
| `ConnectionStrings:Postgres` (`ConnectionStrings__Postgres`) | Npgsql connection string. Required. |
| `Firebase:ProjectId` (`Firebase__ProjectId`) | Firebase project id. Required. Tokens are validated against authority/issuer `https://securetoken.google.com/{ProjectId}` and audience `{ProjectId}`; project endpoints also require `email_verified=true`. |
| `Database:AutoMigrate` (`Database__AutoMigrate`) | `true` applies EF migrations at startup. Default `false` (`true` in `appsettings.Development.json`). |
| `Cors:AllowedOrigins` (`Cors__AllowedOrigins__0`, ...) | Allowed browser origins. Default `http://localhost:5173`. |

Local URL: `http://localhost:5080` (launch profile). Container: port `8080` (`ASPNETCORE_HTTP_PORTS=8080`).
Health: `GET /health` (includes a database connectivity check).

## Commands (from `backend/`)

```powershell
dotnet tool restore
dotnet build
dotnet test
dotnet run --project src/Cartao.Api
dotnet ef database update --project src/Cartao.Api --connection "Host=...;Database=...;Username=...;Password=..."
dotnet ef migrations script --idempotent --project src/Cartao.Api -o migrate.sql
docker build -t cartao-api .
```

## API

Authenticated (Firebase `Authorization: Bearer <idToken>`, verified e-mail):
`GET/POST /api/projects`, `GET/PUT/DELETE /api/projects/{id}`, `POST /api/projects/{id}/publish`, `DELETE /api/projects/{id}/publication` (204).
Public: `GET /api/pages/{slug}`. Errors use `application/problem+json`; stale revisions and taken slugs return 409.
