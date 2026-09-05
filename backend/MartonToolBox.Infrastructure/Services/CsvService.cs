using System.Text;
using MartonToolBox.Application.Csv;

namespace MartonToolBox.Infrastructure.Services;

public sealed class CsvService : ICsvService
{
    private const int PreviewLimit = 100;

    public CsvPreviewDto Preview(Stream source)
    {
        var (headers, rows) = Read(source);
        return new CsvPreviewDto(headers, rows.Take(PreviewLimit).ToArray(), rows.Count, headers.Length, CountDuplicates(rows), rows.Count(IsEmpty));
    }

    public CsvCleanResult Clean(Stream source, CsvCleanRequest request)
    {
        var (headers, input) = Read(source);
        var originalRows = input.Count;
        var emptyRows = request.RemoveEmptyRows ? input.Count(IsEmpty) : 0;
        var rows = request.RemoveEmptyRows ? input.Where(r => !IsEmpty(r)).ToList() : input;
        if (request.TrimWhitespace) rows = rows.Select(r => r.Select(x => x.Trim()).ToArray()).ToList();
        var duplicates = 0;
        if (request.RemoveDuplicates)
        {
            var seen = new HashSet<string>(StringComparer.Ordinal);
            rows = rows.Where(row => seen.Add(string.Join("\u001f", row))).ToList();
            duplicates = originalRows - emptyRows - rows.Count;
        }
        var indexes = request.ColumnsToKeep is { Length: > 0 }
            ? request.ColumnsToKeep.Select(x => Array.FindIndex(headers, h => string.Equals(h, x, StringComparison.OrdinalIgnoreCase))).Where(i => i >= 0).ToArray()
            : Enumerable.Range(0, headers.Length).ToArray();
        var outputHeaders = indexes.Select(i => request.RenamedColumns is not null && request.RenamedColumns.TryGetValue(headers[i], out var rename) ? rename : headers[i]).ToArray();
        var csv = new StringBuilder().AppendLine(string.Join(',', outputHeaders.Select(Escape)));
        foreach (var row in rows) csv.AppendLine(string.Join(',', indexes.Select(i => Escape(i < row.Length ? row[i] : string.Empty))));
        return new CsvCleanResult(Encoding.UTF8.GetBytes(csv.ToString()), originalRows, rows.Count, duplicates, emptyRows);
    }

    private static (string[] Headers, List<string[]> Rows) Read(Stream stream)
    {
        using var reader = new StreamReader(stream, Encoding.UTF8, true, leaveOpen: true);
        var lines = reader.ReadToEnd().Replace("\r\n", "\n").Replace('\r', '\n').Split('\n', StringSplitOptions.RemoveEmptyEntries);
        if (lines.Length == 0) return ([], []);
        return (ParseLine(lines[0]), lines.Skip(1).Select(ParseLine).ToList());
    }

    private static string[] ParseLine(string line)
    {
        var result = new List<string>(); var value = new StringBuilder(); var quoted = false;
        for (var i = 0; i < line.Length; i++) { var c = line[i]; if (c == '"' && (i + 1 >= line.Length || line[i + 1] != '"')) quoted = !quoted; else if (c == '"' && quoted) { value.Append('"'); i++; } else if (c == ',' && !quoted) { result.Add(value.ToString()); value.Clear(); } else value.Append(c); }
        result.Add(value.ToString()); return result.ToArray();
    }
    private static string Escape(string value) => value.IndexOfAny([',', '"', '\n']) >= 0 ? $"\"{value.Replace("\"", "\"\"")}\"" : value;
    private static bool IsEmpty(string[] row) => row.All(string.IsNullOrWhiteSpace);
    private static int CountDuplicates(IEnumerable<string[]> rows) => rows.Count() - rows.Select(r => string.Join("\u001f", r)).Distinct(StringComparer.Ordinal).Count();
}
