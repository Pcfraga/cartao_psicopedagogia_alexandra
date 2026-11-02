using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace Cartao.Api.Tests;

public sealed class ProjectsApiTests : IAsyncLifetime
{
    private readonly ApiFactory _factory = new();

    public Task InitializeAsync() => _factory.EnsureDatabaseAsync();
    public async Task DisposeAsync() => await _factory.DisposeAsync();

    private static JsonObject Values(string title = "Apoio escolar", string primary = "#AABBCC") => new()
    {
        ["format"] = "landing", ["title"] = title, ["subtitle"] = "Sub", ["name"] = "Alexandra",
        ["role"] = "Psicopedagoga", ["cta"] = "Fale comigo", ["phone"] = "11999999999",
        ["primary"] = primary, ["accent"] = "#00ff00"
    };

    private static object Save(JsonObject values, int revision, string? photo = null) =>
        new { values, photo = photo ?? TestPng.DataUrl(), revision };

    private static async Task<JsonElement> Json(HttpResponseMessage response) =>
        (await response.Content.ReadFromJsonAsync<JsonElement>());

    private static async Task<JsonElement> Create(HttpClient client, string title = "Apoio escolar")
    {
        var response = await client.PostAsJsonAsync("/api/projects", Save(Values(title), 0));
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return await Json(response);
    }

    [Fact]
    public async Task Requires_valid_verified_firebase_token()
    {
        Assert.Equal(HttpStatusCode.Unauthorized, (await _factory.ClientFor(null).GetAsync("/api/projects")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await _factory.ClientFor("u1", emailVerified: false).GetAsync("/api/projects")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await _factory.ClientFor("u1", issuer: "https://securetoken.google.com/other").GetAsync("/api/projects")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await _factory.ClientFor("u1", audience: "other").GetAsync("/api/projects")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await _factory.ClientFor("u1", wrongKey: true).GetAsync("/api/projects")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await _factory.ClientFor("u1").GetAsync("/api/projects")).StatusCode);
    }

    [Fact]
    public async Task Create_and_read_round_trips_contract()
    {
        var client = _factory.ClientFor("owner");
        var created = await Create(client);
        Assert.Equal(1, created.GetProperty("revision").GetInt32());
        Assert.Equal(TestPng.DataUrl(), created.GetProperty("photo").GetString());
        Assert.Equal("#AABBCC", created.GetProperty("values").GetProperty("primary").GetString());
        Assert.Equal(JsonValueKind.Null, created.GetProperty("publication").ValueKind);
        Assert.True(Guid.TryParse(created.GetProperty("id").GetString(), out _));
        Assert.True(DateTimeOffset.TryParse(created.GetProperty("updatedAt").GetString(), out _));
        Assert.Equal(9, created.GetProperty("values").EnumerateObject().Count());

        var list = await Json(await client.GetAsync("/api/projects"));
        Assert.Single(list.EnumerateArray());
        var single = await Json(await client.GetAsync($"/api/projects/{created.GetProperty("id").GetString()}"));
        Assert.Equal(created.GetProperty("photo").GetString(), single.GetProperty("photo").GetString());
    }

    [Fact]
    public async Task Drafts_are_isolated_by_owner()
    {
        var owner = _factory.ClientFor("owner");
        var other = _factory.ClientFor("intruder");
        var id = (await Create(owner)).GetProperty("id").GetString();

        Assert.Empty((await Json(await other.GetAsync("/api/projects"))).EnumerateArray());
        Assert.Equal(HttpStatusCode.NotFound, (await other.GetAsync($"/api/projects/{id}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await other.PutAsJsonAsync($"/api/projects/{id}", Save(Values("hack"), 1))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await other.PostAsJsonAsync($"/api/projects/{id}/publish", new { slug = "hacked", revision = 1 })).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await other.DeleteAsync($"/api/projects/{id}/publication")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await other.DeleteAsync($"/api/projects/{id}")).StatusCode);

        var mine = await Json(await owner.GetAsync($"/api/projects/{id}"));
        Assert.Equal("Apoio escolar", mine.GetProperty("values").GetProperty("title").GetString());
        Assert.Equal(1, mine.GetProperty("revision").GetInt32());
    }

    [Fact]
    public async Task Stale_revisions_conflict()
    {
        var client = _factory.ClientFor("owner");
        var id = (await Create(client)).GetProperty("id").GetString();

        var updated = await client.PutAsJsonAsync($"/api/projects/{id}", Save(Values("v2"), 1));
        Assert.Equal(HttpStatusCode.OK, updated.StatusCode);
        Assert.Equal(2, (await Json(updated)).GetProperty("revision").GetInt32());

        var stale = await client.PutAsJsonAsync($"/api/projects/{id}", Save(Values("v3"), 1));
        Assert.Equal(HttpStatusCode.Conflict, stale.StatusCode);
        Assert.Equal("application/problem+json", stale.Content.Headers.ContentType?.MediaType);
        Assert.Equal(HttpStatusCode.Conflict,
            (await client.PostAsJsonAsync($"/api/projects/{id}/publish", new { slug = "minha-pagina", revision = 1 })).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await _factory.ClientFor(null).GetAsync("/api/pages/minha-pagina")).StatusCode);
    }

    [Fact]
    public async Task Publication_is_an_immutable_snapshot_until_republished()
    {
        var client = _factory.ClientFor("owner");
        var anonymous = _factory.ClientFor(null);
        var id = (await Create(client, "Primeira")).GetProperty("id").GetString();

        var published = await client.PostAsJsonAsync($"/api/projects/{id}/publish", new { slug = "minha-pagina", revision = 1 });
        Assert.Equal(HttpStatusCode.OK, published.StatusCode);
        Assert.Equal("minha-pagina", (await Json(published)).GetProperty("publication").GetProperty("slug").GetString());

        var newPhoto = TestPng.DataUrl(4, 4);
        var draft = await client.PutAsJsonAsync($"/api/projects/{id}", Save(Values("Segunda"), 1, newPhoto));
        Assert.Equal(HttpStatusCode.OK, draft.StatusCode);
        Assert.Equal("minha-pagina", (await Json(draft)).GetProperty("publication").GetProperty("slug").GetString());

        var page = await Json(await anonymous.GetAsync("/api/pages/minha-pagina"));
        Assert.Equal("Primeira", page.GetProperty("values").GetProperty("title").GetString());
        Assert.Equal(TestPng.DataUrl(), page.GetProperty("photo").GetString());
        Assert.Equal("minha-pagina", page.GetProperty("slug").GetString());

        var renamed = await client.PostAsJsonAsync($"/api/projects/{id}/publish", new { slug = "novo-endereco", revision = 2 });
        Assert.Equal(HttpStatusCode.OK, renamed.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await anonymous.GetAsync("/api/pages/minha-pagina")).StatusCode);
        page = await Json(await anonymous.GetAsync("/api/pages/novo-endereco"));
        Assert.Equal("Segunda", page.GetProperty("values").GetProperty("title").GetString());
        Assert.Equal(newPhoto, page.GetProperty("photo").GetString());

        Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync($"/api/projects/{id}/publication")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await anonymous.GetAsync("/api/pages/novo-endereco")).StatusCode);
        Assert.Equal(JsonValueKind.Null, (await Json(await client.GetAsync($"/api/projects/{id}"))).GetProperty("publication").ValueKind);

        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync($"/api/projects/{id}/publish", new { slug = "de-novo", revision = 2 })).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync($"/api/projects/{id}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await anonymous.GetAsync("/api/pages/de-novo")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync($"/api/projects/{id}")).StatusCode);
    }

    [Fact]
    public async Task Slugs_are_globally_unique_and_validated()
    {
        var first = _factory.ClientFor("a");
        var second = _factory.ClientFor("b");
        var a = (await Create(first)).GetProperty("id").GetString();
        var b = (await Create(second)).GetProperty("id").GetString();

        Assert.Equal(HttpStatusCode.OK, (await first.PostAsJsonAsync($"/api/projects/{a}/publish", new { slug = "endereco", revision = 1 })).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await second.PostAsJsonAsync($"/api/projects/{b}/publish", new { slug = "endereco", revision = 1 })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await first.PostAsJsonAsync($"/api/projects/{a}/publish", new { slug = "endereco", revision = 1 })).StatusCode);

        foreach (var slug in new[] { "ab", "Maiuscula", "-inicio", "fim-", "com espaco", new string('a', 61) })
            Assert.Equal(HttpStatusCode.BadRequest,
                (await second.PostAsJsonAsync($"/api/projects/{b}/publish", new { slug, revision = 1 })).StatusCode);
        Assert.Equal(HttpStatusCode.OK,
            (await second.PostAsJsonAsync($"/api/projects/{b}/publish", new { slug = new string('a', 60), revision = 1 })).StatusCode);
    }

    public static TheoryData<string> InvalidBodies()
    {
        var extra = Values(); extra["extra"] = "x";
        var missing = Values(); missing.Remove("cta");
        var number = Values(); number["phone"] = 123;
        return new TheoryData<string>
        {
            JsonSerializer.Serialize(Save(Values(new string('x', 101)), 0)),
            JsonSerializer.Serialize(Save(Values(primary: "red"), 0)),
            JsonSerializer.Serialize(Save(Values().Apply(v => v["format"] = "wide"), 0)),
            JsonSerializer.Serialize(Save(extra, 0)),
            JsonSerializer.Serialize(Save(missing, 0)),
            JsonSerializer.Serialize(Save(number, 0)),
            JsonSerializer.Serialize(Save(Values(), 0, "data:image/jpeg;base64,AAAA")),
            JsonSerializer.Serialize(Save(Values(), 0, "data:image/png;base64,bm90IGEgcG5n")),
            JsonSerializer.Serialize(Save(Values(), 0, TestPng.DataUrl(1921, 10))),
            JsonSerializer.Serialize(Save(Values(), 0, TestPng.DataUrl(paddingBytes: 5 * 1024 * 1024))),
            JsonSerializer.Serialize(Save(Values(), 5)),
            "{\"values\":[],\"photo\":\"\",\"revision\":0}",
        };
    }

    [Theory]
    [MemberData(nameof(InvalidBodies))]
    public async Task Invalid_payloads_are_rejected(string body)
    {
        var response = await _factory.ClientFor("owner").PostAsync("/api/projects",
            new StringContent(body, System.Text.Encoding.UTF8, "application/json"));
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
    }

    [Fact]
    public async Task Accepts_limits_exactly()
    {
        var values = Values(new string('t', 100));
        values["subtitle"] = new string('s', 180);
        values["name"] = new string('n', 60);
        values["role"] = new string('r', 45);
        values["cta"] = new string('c', 32);
        values["phone"] = new string('9', 20);
        var response = await _factory.ClientFor("owner").PostAsJsonAsync("/api/projects", Save(values, 0, TestPng.DataUrl(1920, 1920)));
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
    }

    [Fact]
    public async Task Public_endpoints_and_errors_use_problem_details()
    {
        var anonymous = _factory.ClientFor(null);
        Assert.Equal(HttpStatusCode.OK, (await anonymous.GetAsync("/health")).StatusCode);
        var missing = await anonymous.GetAsync("/api/pages/nao-existe");
        Assert.Equal(HttpStatusCode.NotFound, missing.StatusCode);
        Assert.Equal("application/problem+json", missing.Content.Headers.ContentType?.MediaType);
        var unauthorized = await anonymous.GetAsync("/api/projects");
        Assert.Equal("application/problem+json", unauthorized.Content.Headers.ContentType?.MediaType);
    }
}

internal static class JsonObjectExtensions
{
    public static JsonObject Apply(this JsonObject obj, Action<JsonObject> change)
    {
        change(obj);
        return obj;
    }
}
