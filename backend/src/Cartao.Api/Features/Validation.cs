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
            if (property.Name is "design" or "landing")
            {
                if (element.EnumerateObject().Count(p => p.Name == property.Name) > 1)
                    errors[$"values.{property.Name}"] = ["Duplicated field."];
                else if (property.Value.ValueKind != JsonValueKind.Null && !ValidateStudio(property.Value, property.Name == "design"))
                    errors[$"values.{property.Name}"] = ["Invalid composition or page blocks."];
                continue;
            }
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
            map["cta"], map["phone"], map["primary"], map["accent"],
            element.TryGetProperty("design", out var design) && design.ValueKind != JsonValueKind.Null ? design.Clone() : null,
            element.TryGetProperty("landing", out var landing) && landing.ValueKind != JsonValueKind.Null ? landing.Clone() : null);
    }

    private static bool Text(JsonElement obj, string key, int max) =>
        obj.TryGetProperty(key, out var value) && value.ValueKind == JsonValueKind.String &&
        value.GetString() is { } text && text.Length <= max && !text.Contains('\0');

    private static bool Number(JsonElement obj, string key, double min, double max) =>
        obj.TryGetProperty(key, out var value) && value.ValueKind == JsonValueKind.Number &&
        value.TryGetDouble(out var number) && double.IsFinite(number) && number >= min && number <= max;

    private static bool Choice(JsonElement obj, string key, params string[] choices) =>
        obj.TryGetProperty(key, out var value) && value.ValueKind == JsonValueKind.String && choices.Contains(value.GetString());

    private static bool Color(JsonElement obj, string key) =>
        obj.TryGetProperty(key, out var value) && value.ValueKind == JsonValueKind.String && HexColor().IsMatch(value.GetString()!);

    private static bool Boolean(JsonElement obj, string key) =>
        obj.TryGetProperty(key, out var value) && value.ValueKind is JsonValueKind.True or JsonValueKind.False;

    private static bool Image(JsonElement obj, string key) =>
        obj.TryGetProperty(key, out var value) && value.ValueKind == JsonValueKind.String &&
        (value.GetString() == "photo" || DecodePng(value.GetString()) is not null);

    private static bool ValidateStudio(JsonElement root, bool design)
    {
        if (root.ValueKind != JsonValueKind.Object || !Number(root, "version", 1, 1) ||
            !root.TryGetProperty(design ? "elements" : "blocks", out var list) || list.ValueKind != JsonValueKind.Array ||
            list.GetArrayLength() > (design ? 40 : 16) || (!design && list.GetArrayLength() == 0) ||
            (design && (!Color(root, "background") || (!Number(root, "height", 1080, 1080) && !Number(root, "height", 1920, 1920))))) return false;
        var ids = new HashSet<string>();
        foreach (var item in list.EnumerateArray())
        {
            if (item.ValueKind != JsonValueKind.Object || !Text(item, "id", 80) ||
                string.IsNullOrEmpty(item.GetProperty("id").GetString()) || !ids.Add(item.GetProperty("id").GetString()!)) return false;
            if (design)
            {
                if (!Choice(item, "type", "text", "image", "shape") || !Text(item, "name", 80) || !Text(item, "text", 2000) ||
                    !Number(item, "x", -2160, 2160) || !Number(item, "y", -3840, 3840) ||
                    !Number(item, "width", 20, 2160) || !Number(item, "height", 20, 3840) ||
                    !Number(item, "rotation", -360, 360) || !Number(item, "opacity", 0, 1) ||
                    !Number(item, "fontSize", 10, 240) || !Number(item, "radius", 0, 1080) ||
                    !Number(item, "zoom", 1, 4) || !Number(item, "panX", 0, 100) || !Number(item, "panY", 0, 100) ||
                    (item.TryGetProperty("fit", out _) && !Choice(item, "fit", "contain", "cover", "stretch")) ||
                    (item.TryGetProperty("showText", out _) && !Boolean(item, "showText")) ||
                    (item.TryGetProperty("textBackground", out _) && !Boolean(item, "textBackground")) ||
                    (item.TryGetProperty("padding", out _) && !Number(item, "padding", 0, 100)) ||
                    (item.TryGetProperty("borderWidth", out _) && !Number(item, "borderWidth", 0, 40)) ||
                    (item.TryGetProperty("borderColor", out _) && !Color(item, "borderColor")) ||
                    (item.TryGetProperty("shadowBlur", out _) && !Number(item, "shadowBlur", 0, 80)) ||
                    (item.TryGetProperty("shadowColor", out _) && !Color(item, "shadowColor")) ||
                    !Number(item, "brightness", 0, 200) || !Number(item, "contrast", 0, 200) || !Number(item, "saturation", 0, 200) ||
                    !Boolean(item, "locked") || !Boolean(item, "bold") || !Boolean(item, "italic") ||
                    !Choice(item, "fontFamily", "Arial", "Georgia", "Trebuchet MS", "Verdana", "Courier New") ||
                    !Choice(item, "align", "left", "center", "right") ||
                    !Choice(item, "shape", "rectangle", "ellipse", "triangle", "diamond", "star", "hexagon", "arrow", "speech") ||
                    !Color(item, "color") || !Color(item, "background") || !Image(item, "src")) return false;
            }
            else
            {
                if (!Choice(item, "type", "hero", "text", "services", "gallery", "contact") ||
                    !Text(item, "title", 160) || !Text(item, "body", 3000) || !Color(item, "background") ||
                    !Choice(item, "align", "left", "center") || !Image(item, "image") ||
                    !item.TryGetProperty("items", out var items) || items.ValueKind != JsonValueKind.Array ||
                    items.GetArrayLength() > 12 || items.EnumerateArray().Any(v =>
                        v.ValueKind != JsonValueKind.String || v.GetString()!.Length > 240 || v.GetString()!.Contains('\0'))) return false;
            }
        }
        return true;
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
