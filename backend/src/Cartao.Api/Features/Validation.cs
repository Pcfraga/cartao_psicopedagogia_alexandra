using System.Buffers.Binary;
using System.Text.Json;
using System.Text.RegularExpressions;
using Cartao.Api.Data;

namespace Cartao.Api.Features;

public static partial class Validation
{
    public const string PngDataUrlPrefix = "data:image/png;base64,";
    public const int MaxPhotoBytes = 5 * 1024 * 1024;
    public const int MaxPhotoDimension = 1920;

    private static readonly (string Key, int MaxLength)[] TextFields =
    [
        ("title", 100), ("subtitle", 180), ("name", 60), ("role", 45), ("cta", 32), ("phone", 20)
    ];

    private static readonly string[] Formats = ["square", "story", "landing"];
    private static readonly byte[] PngSignature = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
    private static readonly byte[] PngEnd = [0, 0, 0, 0, 0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82];

    [GeneratedRegex("^#[0-9a-fA-F]{6}$")]
    private static partial Regex HexColor();

    [GeneratedRegex("^[a-z0-9][a-z0-9-]{1,58}[a-z0-9]$")]
    private static partial Regex SlugPattern();

    public static bool IsValidSlug(string? slug) => slug is not null && SlugPattern().IsMatch(slug);

    public static ProjectValues? ParseValues(JsonElement element, IDictionary<string, string[]> errors)
    {
        if (element.ValueKind != JsonValueKind.Object)
        {
            errors["values"] = ["Values must be an object."];
            return null;
        }

        var allowed = TextFields.Select(f => f.Key).Concat(["format", "primary", "accent"]).ToHashSet();
        var map = new Dictionary<string, string>();
        foreach (var property in element.EnumerateObject())
        {
            if (!allowed.Contains(property.Name) || map.ContainsKey(property.Name))
            {
                errors[$"values.{property.Name}"] = ["Unknown or duplicated field."];
                continue;
            }
            if (property.Value.ValueKind != JsonValueKind.String)
            {
                errors[$"values.{property.Name}"] = ["Must be a string."];
                continue;
            }
            var text = property.Value.GetString()!;
            if (text.Contains('\0'))
            {
                errors[$"values.{property.Name}"] = ["Contains invalid characters."];
                continue;
            }
            map[property.Name] = text;
        }

        foreach (var key in allowed.Where(k => !map.ContainsKey(k) && !errors.ContainsKey($"values.{k}")))
            errors[$"values.{key}"] = ["Required."];

        foreach (var (key, max) in TextFields)
            if (map.TryGetValue(key, out var text) && text.EnumerateRunes().Count() > max)
                errors[$"values.{key}"] = [$"Must have at most {max} characters."];

        if (map.TryGetValue("format", out var format) && !Formats.Contains(format))
            errors["values.format"] = ["Must be square, story or landing."];
        foreach (var key in new[] { "primary", "accent" })
            if (map.TryGetValue(key, out var color) && !HexColor().IsMatch(color))
                errors[$"values.{key}"] = ["Must be a #RRGGBB color."];

        if (errors.Keys.Any(k => k.StartsWith("values", StringComparison.Ordinal))) return null;
        return new ProjectValues(map["format"], map["title"], map["subtitle"], map["name"], map["role"],
            map["cta"], map["phone"], map["primary"], map["accent"]);
    }

    public static byte[]? ParsePhoto(string? dataUrl, IDictionary<string, string[]> errors)
    {
        var png = DecodePng(dataUrl);
        if (png is null) errors["photo"] = [$"Photo must be a valid PNG data URL up to 5 MB and {MaxPhotoDimension}x{MaxPhotoDimension} pixels."];
        return png;
    }

    private static byte[]? DecodePng(string? dataUrl)
    {
        if (dataUrl is null || !dataUrl.StartsWith(PngDataUrlPrefix, StringComparison.Ordinal)) return null;
        var base64 = dataUrl.AsSpan(PngDataUrlPrefix.Length);
        if (base64.Length == 0 || base64.Length > (MaxPhotoBytes + 2) / 3 * 4) return null;

        var buffer = new byte[base64.Length / 4 * 3];
        if (!Convert.TryFromBase64Chars(base64, buffer, out var written) || written > MaxPhotoBytes) return null;
        var bytes = buffer.AsSpan(0, written);

        if (bytes.Length < 8 + 25 + 12 || !bytes[..8].SequenceEqual(PngSignature)) return null;
        if (BinaryPrimitives.ReadUInt32BigEndian(bytes[8..]) != 13 || !bytes[12..16].SequenceEqual("IHDR"u8)) return null;
        var width = BinaryPrimitives.ReadUInt32BigEndian(bytes[16..]);
        var height = BinaryPrimitives.ReadUInt32BigEndian(bytes[20..]);
        if (width is 0 or > MaxPhotoDimension || height is 0 or > MaxPhotoDimension) return null;
        if (!bytes[^12..].SequenceEqual(PngEnd)) return null;

        return bytes.ToArray();
    }

    public static string ToDataUrl(byte[] png) => PngDataUrlPrefix + Convert.ToBase64String(png);
}
