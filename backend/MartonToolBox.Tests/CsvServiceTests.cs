using System.Text;
using MartonToolBox.Application.Csv;
using MartonToolBox.Infrastructure.Services;
using Xunit;

namespace MartonToolBox.Tests;

public sealed class CsvServiceTests
{
    [Fact]
    public void Preview_detects_duplicate_and_empty_rows()
    {
        using var stream = new MemoryStream(Encoding.UTF8.GetBytes("name,email\nAda,ada@example.com\nAda,ada@example.com\n,\n"));
        var preview = new CsvService().Preview(stream);
        Assert.Equal(3, preview.RowCount); Assert.Equal(1, preview.DuplicateRows); Assert.Equal(1, preview.EmptyRows);
    }
    [Fact]
    public void Clean_removes_empty_duplicate_rows_and_trims_values()
    {
        using var stream = new MemoryStream(Encoding.UTF8.GetBytes("name\n Ada \nAda\n\n"));
        var output = new CsvService().Clean(stream, new CsvCleanRequest());
        Assert.Equal("name\nAda\n", Encoding.UTF8.GetString(output.Content).Replace("\r\n", "\n")); Assert.Equal(1, output.ResultRows);
    }
}
