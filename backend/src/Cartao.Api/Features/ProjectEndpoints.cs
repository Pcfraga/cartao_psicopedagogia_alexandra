using System.Security.Claims;
using Cartao.Api.Data;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace Cartao.Api.Features;

public static class ProjectEndpoints
{
    public const string VerifiedUserPolicy = "VerifiedFirebaseUser";

    public static void MapProjectEndpoints(this IEndpointRouteBuilder app)
    {
        var projects = app.MapGroup("/api/projects").RequireAuthorization(VerifiedUserPolicy);
        projects.MapGet("/", List);
        projects.MapGet("/{id:guid}", Get);
        projects.MapPost("/", Create);
        projects.MapPut("/{id:guid}", Update);
        projects.MapDelete("/{id:guid}", Delete);
        projects.MapPost("/{id:guid}/publish", Publish);
        projects.MapDelete("/{id:guid}/publication", Unpublish);

        app.MapGet("/api/pages/{slug}", GetPage).AllowAnonymous();
    }

    private static string Owner(ClaimsPrincipal user) =>
        user.FindFirstValue("sub") ?? throw new InvalidOperationException("Authenticated user has no subject.");

    private static IResult NotFound() => TypedResults.Problem(statusCode: 404, title: "Project not found.");

    private static IResult Conflict(string detail) => TypedResults.Problem(statusCode: 409, title: "Conflict", detail: detail);

    private static IResult StaleRevision() =>
        Conflict("The project was changed elsewhere. Reload it before trying again.");

    private static bool IsUniqueViolation(DbUpdateException ex) =>
        ex.InnerException is PostgresException { SqlState: PostgresErrorCodes.UniqueViolation };

    private static ProjectDto ToDto(Project p) => new(p.Id, p.Values, Validation.ToDataUrl(p.Photo), p.Revision,
        p.UpdatedAt, p.Publication is null ? null : new PublicationDto(p.Publication.Slug, p.Publication.PublishedAt));

    private static async Task<ProjectDto?> Load(AppDbContext db, string owner, Guid id, CancellationToken ct)
    {
        var row = await db.Projects.AsNoTracking().Where(p => p.OwnerId == owner && p.Id == id)
            .Select(p => new { p.Photo, Dto = new ProjectDto(p.Id, p.Values, "", p.Revision, p.UpdatedAt,
                p.Publication == null ? null : new PublicationDto(p.Publication.Slug, p.Publication.PublishedAt)) })
            .SingleOrDefaultAsync(ct);
        return row is null ? null : row.Dto with { Photo = Validation.ToDataUrl(row.Photo) };
    }

    private static async Task<IResult> List(ClaimsPrincipal user, AppDbContext db, CancellationToken ct)
    {
        var owner = Owner(user);
        var rows = await db.Projects.AsNoTracking().Where(p => p.OwnerId == owner)
            .Select(p => new { p.Photo, Dto = new ProjectDto(p.Id, p.Values, "", p.Revision, p.UpdatedAt,
                p.Publication == null ? null : new PublicationDto(p.Publication.Slug, p.Publication.PublishedAt)) })
            .ToListAsync(ct);
        return TypedResults.Ok(rows.OrderByDescending(r => r.Dto.UpdatedAt)
            .Select(r => r.Dto with { Photo = Validation.ToDataUrl(r.Photo) }).ToList());
    }

    private static async Task<IResult> Get(Guid id, ClaimsPrincipal user, AppDbContext db, CancellationToken ct) =>
        await Load(db, Owner(user), id, ct) is { } dto ? TypedResults.Ok(dto) : NotFound();

    private static (ProjectValues?, byte[]?, Dictionary<string, string[]>) ParseSave(SaveProjectRequest? body)
    {
        var errors = new Dictionary<string, string[]>();
        if (body is null)
        {
            errors["body"] = ["Request body is required."];
            return (null, null, errors);
        }
        var values = Validation.ParseValues(body.Values, errors);
        var photo = Validation.ParsePhoto(body.Photo, errors);
        if (body.Revision is null or < 0) errors["revision"] = ["Revision is required."];
        return (values, photo, errors);
    }

    private static async Task<IResult> Create(SaveProjectRequest? body, ClaimsPrincipal user, AppDbContext db, CancellationToken ct)
    {
        var (values, photo, errors) = ParseSave(body);
        if (body?.Revision is > 0) errors["revision"] = ["New projects must use revision 0."];
        if (errors.Count > 0) return TypedResults.ValidationProblem(errors);

        var project = new Project
        {
            Id = Guid.NewGuid(), OwnerId = Owner(user), Values = values!, Photo = photo!,
            Revision = 1, UpdatedAt = DateTimeOffset.UtcNow
        };
        db.Projects.Add(project);
        await db.SaveChangesAsync(ct);
        return TypedResults.Created($"/api/projects/{project.Id}", ToDto(project));
    }

    private static async Task<IResult> Update(Guid id, SaveProjectRequest? body, ClaimsPrincipal user, AppDbContext db, CancellationToken ct)
    {
        var (values, photo, errors) = ParseSave(body);
        if (errors.Count > 0) return TypedResults.ValidationProblem(errors);

        var owner = Owner(user);
        var project = await db.Projects.Include(p => p.Publication)
            .SingleOrDefaultAsync(p => p.OwnerId == owner && p.Id == id, ct);
        if (project is null) return NotFound();
        if (project.Revision != body!.Revision) return StaleRevision();

        project.Values = values!;
        project.Photo = photo!;
        project.Revision++;
        project.UpdatedAt = DateTimeOffset.UtcNow;
        try
        {
            await db.SaveChangesAsync(ct);
        }
        catch (DbUpdateConcurrencyException)
        {
            return StaleRevision();
        }
        return TypedResults.Ok(ToDto(project));
    }

    private static async Task<IResult> Delete(Guid id, ClaimsPrincipal user, AppDbContext db, CancellationToken ct)
    {
        var owner = Owner(user);
        var project = await db.Projects.Include(p => p.Publication)
            .SingleOrDefaultAsync(p => p.OwnerId == owner && p.Id == id, ct);
        if (project is null) return NotFound();
        db.Projects.Remove(project);
        try
        {
            await db.SaveChangesAsync(ct);
        }
        catch (DbUpdateConcurrencyException)
        {
            return StaleRevision();
        }
        return TypedResults.NoContent();
    }

    private static async Task<IResult> Publish(Guid id, PublishRequest? body, ClaimsPrincipal user, AppDbContext db, CancellationToken ct)
    {
        var errors = new Dictionary<string, string[]>();
        if (!Validation.IsValidSlug(body?.Slug))
            errors["slug"] = ["Use 3 to 60 lowercase letters, digits or hyphens, starting and ending with a letter or digit."];
        if (body?.Revision is null or < 1) errors["revision"] = ["Revision is required."];
        if (errors.Count > 0) return TypedResults.ValidationProblem(errors);

        var owner = Owner(user);
        var project = await db.Projects.Include(p => p.Publication)
            .SingleOrDefaultAsync(p => p.OwnerId == owner && p.Id == id, ct);
        if (project is null) return NotFound();
        if (project.Revision != body!.Revision) return StaleRevision();
        var slug = body.Slug!;
        if (await db.Pages.AnyAsync(p => p.Slug == slug && p.ProjectId != id, ct))
            return Conflict("This address is already in use.");

        var now = DateTimeOffset.UtcNow;
        if (project.Publication is null)
        {
            project.Publication = new PublishedPage
            {
                ProjectId = project.Id, OwnerId = owner, Slug = slug,
                Values = project.Values, Photo = project.Photo, PublishedAt = now
            };
        }
        else
        {
            project.Publication.Slug = slug;
            project.Publication.Values = project.Values;
            project.Publication.Photo = project.Photo;
            project.Publication.PublishedAt = now;
        }
        // Touch the revision so the draft row is checked/locked in the same atomic SaveChanges.
        db.Entry(project).Property(p => p.Revision).IsModified = true;
        try
        {
            await db.SaveChangesAsync(ct);
        }
        catch (DbUpdateConcurrencyException)
        {
            return StaleRevision();
        }
        catch (DbUpdateException ex) when (IsUniqueViolation(ex))
        {
            return Conflict("This address is already in use.");
        }
        return TypedResults.Ok(ToDto(project));
    }

    private static async Task<IResult> Unpublish(Guid id, ClaimsPrincipal user, AppDbContext db, CancellationToken ct)
    {
        var owner = Owner(user);
        if (!await db.Projects.AnyAsync(p => p.OwnerId == owner && p.Id == id, ct)) return NotFound();
        await db.Pages.Where(p => p.ProjectId == id && p.OwnerId == owner).ExecuteDeleteAsync(ct);
        return TypedResults.NoContent();
    }

    private static async Task<IResult> GetPage(string slug, AppDbContext db, CancellationToken ct)
    {
        if (!Validation.IsValidSlug(slug)) return TypedResults.Problem(statusCode: 404, title: "Page not found.");
        var page = await db.Pages.AsNoTracking().SingleOrDefaultAsync(p => p.Slug == slug, ct);
        return page is null
            ? TypedResults.Problem(statusCode: 404, title: "Page not found.")
            : TypedResults.Ok(new PublishedPageDto(page.Slug, page.Values, Validation.ToDataUrl(page.Photo), page.PublishedAt));
    }
}
