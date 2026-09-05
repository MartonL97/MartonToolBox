namespace MartonToolBox.Application.Csv;

public sealed record CsvPreviewDto(string[] Headers, string[][] Rows, int RowCount, int ColumnCount, int DuplicateRows, int EmptyRows);
public sealed record CsvCleanRequest(bool RemoveDuplicates = true, bool RemoveEmptyRows = true, bool TrimWhitespace = true, string[]? ColumnsToKeep = null, Dictionary<string, string>? RenamedColumns = null);
public sealed record CsvCleanResult(byte[] Content, int OriginalRows, int ResultRows, int RemovedDuplicates, int RemovedEmptyRows);

public interface ICsvService
{
    CsvPreviewDto Preview(Stream source);
    CsvCleanResult Clean(Stream source, CsvCleanRequest request);
}
