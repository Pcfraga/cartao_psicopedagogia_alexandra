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

## Visual editor

`values.design` and `values.landing` are optional, versioned JSON objects. Legacy
projects omit these fields and retain their original rendering. Design supports
up to 40 validated text/image/shape layers; landing supports 1–16 responsive
blocks, with up to 12 service items each. Image sources are `photo` (the primary
photo) or validated PNG data URLs; remote URLs and SVG are rejected.

Both draft and publication snapshots preserve these fields in the existing JSONB
column, without a schema migration. Deploy the API before the updated frontends.
The existing request-size limit still applies to the complete composition,
including all embedded photos; the editor limits saved files to 7.5 MB.
