using System.Text;
using MartonToolBox.Application.Documents;
using MartonToolBox.Infrastructure.Services;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace MartonToolBox.Tests;

public sealed class LibreOfficeConverterTests
{
    private static readonly LibreOfficeConverter Converter = new(new ConfigurationBuilder().Build(), NullLogger<LibreOfficeConverter>.Instance);

    private static bool SofficeInstalled =>
        File.Exists("/Applications/LibreOffice.app/Contents/MacOS/soffice") || File.Exists("/usr/bin/soffice") || File.Exists("/usr/lib/libreoffice/program/soffice");

    [Fact]
    public async Task Rejects_unsupported_direction_and_fake_files_without_running_libreoffice()
    {
        var ex = await Assert.ThrowsAsync<DocumentConversionException>(() => Converter.ConvertAsync(new MemoryStream([1, 2, 3]), "a.docx", "docx"));
        Assert.Contains("isn't supported", ex.Message);

        ex = await Assert.ThrowsAsync<DocumentConversionException>(() => Converter.ConvertAsync(new MemoryStream(Encoding.UTF8.GetBytes("not a pdf")), "a.pdf", "docx"));
        Assert.Contains("doesn't look like a valid", ex.Message);
    }

    [Fact]
    public async Task Converts_rtf_to_pdf_and_back_from_pdf_to_docx()
    {
        if (!SofficeInstalled) return; // LibreOffice not installed on this machine

        var rtf = Encoding.ASCII.GetBytes(@"{\rtf1\ansi Hello from MartonToolBox\par}");
        var pdf = await Converter.ConvertAsync(new MemoryStream(rtf), "letter.rtf", "pdf");
        Assert.Equal("letter.pdf", pdf.FileName);
        Assert.Equal("%PDF", Encoding.ASCII.GetString(pdf.Content, 0, 4));

        var docx = await Converter.ConvertAsync(new MemoryStream(pdf.Content), "letter.pdf", "docx");
        Assert.Equal("letter.docx", docx.FileName);
        Assert.Equal("PK", Encoding.ASCII.GetString(docx.Content, 0, 2));
    }
}
