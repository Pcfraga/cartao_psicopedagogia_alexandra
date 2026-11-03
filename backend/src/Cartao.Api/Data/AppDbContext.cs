using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.EntityFrameworkCore;

namespace Cartao.Api.Data;

public sealed record ProjectValues(
    string Format, string Title, string Subtitle, string Name, string Role,
    string Cta, string Phone, string Primary, string Accent,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] JsonElement? Design = null,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] JsonElement? Landing = null);

public sealed class Project
{
    public Guid Id { get; set; }
    public required string OwnerId { get; set; }
    public required ProjectValues Values { get; set; }
    public required byte[] Photo { get; set; }
    public int Revision { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
    public PublishedPage? Publication { get; set; }
}

public sealed class PublishedPage
{
    public Guid ProjectId { get; set; }
    public required string OwnerId { get; set; }
    public required string Slug { get; set; }
    public required ProjectValues Values { get; set; }
    public required byte[] Photo { get; set; }
    public DateTimeOffset PublishedAt { get; set; }
}

public sealed class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    public DbSet<Project> Projects => Set<Project>();
    public DbSet<PublishedPage> Pages => Set<PublishedPage>();

    public static string Serialize(ProjectValues values) => JsonSerializer.Serialize(values, Json);
    public static ProjectValues Deserialize(string json) => JsonSerializer.Deserialize<ProjectValues>(json, Json)!;

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        var jsonType = Database.IsNpgsql() ? "jsonb" : null;

        modelBuilder.Entity<Project>(project =>
        {
            project.ToTable("projects");
            project.HasKey(p => p.Id);
            project.Property(p => p.OwnerId).HasMaxLength(128).IsRequired();
            project.HasIndex(p => p.OwnerId);
            project.Property(p => p.Values)
                .HasConversion(v => Serialize(v), s => Deserialize(s))
                .HasColumnType(jsonType).IsRequired();
            project.Property(p => p.Photo).IsRequired();
            project.Property(p => p.Revision).IsConcurrencyToken();
            project.HasOne(p => p.Publication).WithOne()
                .HasForeignKey<PublishedPage>(p => p.ProjectId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<PublishedPage>(page =>
        {
            page.ToTable("published_pages");
            page.HasKey(p => p.ProjectId);
            page.Property(p => p.OwnerId).HasMaxLength(128).IsRequired();
            page.Property(p => p.Slug).HasMaxLength(60).IsRequired();
            page.HasIndex(p => p.Slug).IsUnique();
            page.Property(p => p.Values)
                .HasConversion(v => Serialize(v), s => Deserialize(s))
                .HasColumnType(jsonType).IsRequired();
            page.Property(p => p.Photo).IsRequired();
        });
    }
}
