using System.Buffers.Binary;
using System.Data.Common;
using System.Net.Http.Headers;
using System.Security.Claims;
using System.Text;
using Cartao.Api.Data;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Protocols;
using Microsoft.IdentityModel.Protocols.OpenIdConnect;
using Microsoft.IdentityModel.Tokens;

namespace Cartao.Api.Tests;

public sealed class ApiFactory : WebApplicationFactory<Program>
{
    public const string ProjectId = "test-project";
    public const string Issuer = $"https://securetoken.google.com/{ProjectId}";
    private static readonly SymmetricSecurityKey Key = new(Encoding.UTF8.GetBytes("test-signing-key-test-signing-key-0123456789"));
    private static readonly SymmetricSecurityKey OtherKey = new(Encoding.UTF8.GetBytes("other-signing-key-other-signing-key-012345"));
    private readonly DbConnection _connection = new SqliteConnection("DataSource=:memory:");

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Testing");
        builder.UseSetting("Firebase:ProjectId", ProjectId);
        builder.UseSetting("ConnectionStrings:Postgres", "Host=unused");
        builder.UseSetting("Database:AutoMigrate", "false");
        builder.ConfigureTestServices(services =>
        {
            services.RemoveAll<DbContextOptions<AppDbContext>>();
            services.RemoveAll<IDbContextOptionsConfiguration<AppDbContext>>();
            _connection.Open();
            services.AddDbContext<AppDbContext>(o => o.UseSqlite(_connection));

            services.Configure<JwtBearerOptions>(JwtBearerDefaults.AuthenticationScheme, o =>
            {
                var config = new OpenIdConnectConfiguration { Issuer = Issuer };
                config.SigningKeys.Add(Key);
                o.Configuration = config;
                o.ConfigurationManager = new StaticConfigurationManager<OpenIdConnectConfiguration>(config);
            });
        });
    }

    public HttpClient ClientFor(string? uid, bool emailVerified = true, string issuer = Issuer,
        string audience = ProjectId, bool wrongKey = false)
    {
        var client = CreateClient();
        if (uid is null) return client;
        var token = new JsonWebTokenHandler().CreateToken(new SecurityTokenDescriptor
        {
            Issuer = issuer,
            Audience = audience,
            Expires = DateTime.UtcNow.AddHours(1),
            Claims = new Dictionary<string, object> { ["sub"] = uid, ["email_verified"] = emailVerified },
            SigningCredentials = new SigningCredentials(wrongKey ? OtherKey : Key, SecurityAlgorithms.HmacSha256)
        });
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        return client;
    }

    public async Task EnsureDatabaseAsync()
    {
        using var scope = Services.CreateScope();
        await scope.ServiceProvider.GetRequiredService<AppDbContext>().Database.EnsureCreatedAsync();
    }

    protected override void Dispose(bool disposing)
    {
        base.Dispose(disposing);
        if (disposing) _connection.Dispose();
    }
}

internal static class ServiceCollectionTestExtensions
{
    public static void RemoveAll<T>(this IServiceCollection services)
    {
        foreach (var d in services.Where(d => d.ServiceType == typeof(T)).ToList()) services.Remove(d);
    }
}

public static class TestPng
{
    public static byte[] Create(int width = 2, int height = 2, int paddingBytes = 0)
    {
        var bytes = new List<byte> { 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A };
        var ihdr = new byte[13];
        BinaryPrimitives.WriteUInt32BigEndian(ihdr, (uint)width);
        BinaryPrimitives.WriteUInt32BigEndian(ihdr.AsSpan(4), (uint)height);
        ihdr[8] = 8; ihdr[9] = 6;
        Chunk(bytes, "IHDR", ihdr);
        Chunk(bytes, "IDAT", new byte[paddingBytes + 4]);
        Chunk(bytes, "IEND", []);
        return bytes.ToArray();
    }

    public static string DataUrl(int width = 2, int height = 2, int paddingBytes = 0) =>
        "data:image/png;base64," + Convert.ToBase64String(Create(width, height, paddingBytes));

    private static void Chunk(List<byte> bytes, string type, byte[] data)
    {
        var length = new byte[4];
        BinaryPrimitives.WriteUInt32BigEndian(length, (uint)data.Length);
        bytes.AddRange(length);
        bytes.AddRange(Encoding.ASCII.GetBytes(type));
        bytes.AddRange(data);
        bytes.AddRange(type == "IEND" ? [0xAE, 0x42, 0x60, 0x82] : new byte[4]);
    }
}
