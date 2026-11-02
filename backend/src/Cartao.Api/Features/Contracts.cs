using System.Text.Json;
using Cartao.Api.Data;

namespace Cartao.Api.Features;

public sealed record SaveProjectRequest(JsonElement Values, string? Photo, int? Revision);
public sealed record PublishRequest(string? Slug, int? Revision);
public sealed record PublicationDto(string Slug, DateTimeOffset PublishedAt);
public sealed record ProjectDto(Guid Id, ProjectValues Values, string Photo, int Revision,
    DateTimeOffset UpdatedAt, PublicationDto? Publication);
public sealed record PublishedPageDto(string Slug, ProjectValues Values, string Photo, DateTimeOffset PublishedAt);
