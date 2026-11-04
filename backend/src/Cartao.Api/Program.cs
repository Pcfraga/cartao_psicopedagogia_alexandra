using Cartao.Api.Data;
using Cartao.Api.Features;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Diagnostics.HealthChecks;

var builder = WebApplication.CreateBuilder(args);

// Allow the primary PNG and compressed photos embedded in a layered project.
builder.WebHost.ConfigureKestrel(o => o.Limits.MaxRequestBodySize = 25 * 1024 * 1024);

builder.Services.AddProblemDetails();
builder.Services.AddDbContext<AppDbContext>((sp, o) =>
    o.UseNpgsql(sp.GetRequiredService<IConfiguration>().GetConnectionString("Postgres")));

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme).AddJwtBearer();
builder.Services.AddOptions<JwtBearerOptions>(JwtBearerDefaults.AuthenticationScheme)
    .Configure<IConfiguration>((o, config) =>
    {
        var projectId = config["Firebase:ProjectId"];
        var issuer = $"https://securetoken.google.com/{projectId}";
        o.Authority = issuer;
        o.MapInboundClaims = false;
        o.TokenValidationParameters.ValidateIssuer = true;
        o.TokenValidationParameters.ValidIssuer = issuer;
        o.TokenValidationParameters.ValidateAudience = true;
        o.TokenValidationParameters.ValidAudience = projectId;
        o.TokenValidationParameters.ValidateLifetime = true;
        o.TokenValidationParameters.ValidateIssuerSigningKey = true;
        o.TokenValidationParameters.RequireExpirationTime = true;
        o.TokenValidationParameters.RequireSignedTokens = true;
        o.TokenValidationParameters.NameClaimType = "sub";
    });
builder.Services.AddAuthorizationBuilder()
    .AddPolicy(ProjectEndpoints.VerifiedUserPolicy, p => p
        .RequireAuthenticatedUser()
        .RequireAssertion(c => c.User.FindFirst("sub")?.Value is { Length: > 0 and <= 128 })
        .RequireClaim("email_verified", "true"));

builder.Services.AddCors();
builder.Services.AddOptions<Microsoft.AspNetCore.Cors.Infrastructure.CorsOptions>()
    .Configure<IConfiguration>((o, config) =>
    {
        var origins = config.GetSection("Cors:AllowedOrigins").Get<string[]>() ?? [];
        o.AddDefaultPolicy(p => p.WithOrigins(origins).AllowAnyHeader()
            .WithMethods("GET", "POST", "PUT", "DELETE"));
    });

builder.Services.AddHealthChecks().AddCheck<DatabaseHealthCheck>("database");

var app = builder.Build();

if (!EF.IsDesignTime)
{
    if (string.IsNullOrWhiteSpace(app.Configuration["Firebase:ProjectId"]))
        throw new InvalidOperationException("Configuration 'Firebase:ProjectId' is required.");
    if (string.IsNullOrWhiteSpace(app.Configuration.GetConnectionString("Postgres")))
        throw new InvalidOperationException("Configuration 'ConnectionStrings:Postgres' is required.");

    if (app.Configuration.GetValue<bool>("Database:AutoMigrate"))
    {
        await using var scope = app.Services.CreateAsyncScope();
        await scope.ServiceProvider.GetRequiredService<AppDbContext>().Database.MigrateAsync();
    }
}

app.UseExceptionHandler();
app.UseStatusCodePages();
app.UseCors();
app.UseAuthentication();
app.UseAuthorization();

app.MapHealthChecks("/health").AllowAnonymous();
app.MapProjectEndpoints();

app.Run();

public partial class Program;

internal sealed class DatabaseHealthCheck(AppDbContext db) : IHealthCheck
{
    public async Task<HealthCheckResult> CheckHealthAsync(HealthCheckContext context, CancellationToken ct = default) =>
        await db.Database.CanConnectAsync(ct) ? HealthCheckResult.Healthy() : HealthCheckResult.Unhealthy();
}
