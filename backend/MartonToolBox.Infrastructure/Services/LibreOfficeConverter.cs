using System.Diagnostics;
using MartonToolBox.Application.Documents;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace MartonToolBox.Infrastructure.Services;

/// <summary>
/// Converts documents by shelling out to headless LibreOffice (soffice). Each job runs in its
/// own temp directory with its own LibreOffice profile, so jobs can run in parallel, and the
/// directory - uploaded file included - is deleted as soon as the job ends, success or not.
/// </summary>
public sealed class LibreOfficeConverter(IConfiguration configuration, ILogger<LibreOfficeConverter> logger) : IDocumentConverter
{
    private static readonly string[] WordSources = [".doc", ".docx", ".odt", ".rtf"];
    private static readonly string[] SheetSources = [".xls", ".xlsx", ".ods"];
    private static readonly string[] SlideSources = [".ppt", ".pptx", ".odp"];

    // LibreOffice is memory-hungry; cap how many conversions run at once.
    private static readonly SemaphoreSlim Slots = new(2);
    private static readonly TimeSpan Timeout = TimeSpan.FromMinutes(2);

    public IReadOnlyDictionary<string, IReadOnlyList<string>> SupportedConversions { get; } =
        new Dictionary<string, IReadOnlyList<string>> { [".pdf"] = ["docx"] }
            .Concat(WordSources.Concat(SheetSources).Concat(SlideSources).Select(ext => KeyValuePair.Create(ext, (IReadOnlyList<string>)["pdf"])))
            .ToDictionary(kv => kv.Key, kv => kv.Value, StringComparer.OrdinalIgnoreCase);

    public async Task<ConvertedDocument> ConvertAsync(Stream input, string fileName, string targetFormat, CancellationToken ct = default)
    {
        var sourceExt = Path.GetExtension(fileName).ToLowerInvariant();
        targetFormat = targetFormat.ToLowerInvariant();
        if (!SupportedConversions.TryGetValue(sourceExt, out var targets) || !targets.Contains(targetFormat))
            throw new DocumentConversionException($"Converting {sourceExt} files to {targetFormat.ToUpperInvariant()} isn't supported.");

        var jobDir = Path.Combine(Path.GetTempPath(), "mtb-convert-" + Guid.NewGuid().ToString("N"));
        var outDir = Path.Combine(jobDir, "out");
        Directory.CreateDirectory(outDir);
        try
        {
            // A fixed name keeps the user's file name out of the command line and the file system.
            var inputPath = Path.Combine(jobDir, "input" + sourceExt);
            await using (var file = File.Create(inputPath)) await input.CopyToAsync(file, ct);
            if (!LooksLike(inputPath, sourceExt)) throw new DocumentConversionException($"This file doesn't look like a valid {sourceExt} file.");

            await Slots.WaitAsync(ct);
            try { await RunSofficeAsync(inputPath, sourceExt, targetFormat, jobDir, outDir, ct); }
            finally { Slots.Release(); }

            var outputPath = Path.Combine(outDir, "input." + targetFormat);
            if (!File.Exists(outputPath) || new FileInfo(outputPath).Length == 0)
                throw new DocumentConversionException("The document couldn't be converted. It may be damaged or password-protected.");

            return new ConvertedDocument(
                await File.ReadAllBytesAsync(outputPath, ct),
                Path.GetFileNameWithoutExtension(fileName) + "." + targetFormat,
                targetFormat == "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
        }
        finally
        {
            try { Directory.Delete(jobDir, recursive: true); }
            catch (Exception ex) { logger.LogWarning(ex, "Could not delete conversion directory {Dir}.", jobDir); }
        }
    }

    private async Task RunSofficeAsync(string inputPath, string sourceExt, string targetFormat, string jobDir, string outDir, CancellationToken ct)
    {
        var start = new ProcessStartInfo(SofficePath()) { RedirectStandardOutput = true, RedirectStandardError = true, UseShellExecute = false };
        start.ArgumentList.Add("-env:UserInstallation=" + new Uri(Path.Combine(jobDir, "profile")).AbsoluteUri);
        foreach (var flag in new[] { "--headless", "--norestore", "--nolockcheck", "--nodefault", "--nologo" }) start.ArgumentList.Add(flag);
        // PDFs open in Draw by default; this filter imports them into Writer so they can be saved as .docx.
        if (sourceExt == ".pdf") start.ArgumentList.Add("--infilter=writer_pdf_import");
        start.ArgumentList.Add("--convert-to");
        start.ArgumentList.Add(targetFormat == "docx" ? "docx:MS Word 2007 XML" : "pdf");
        start.ArgumentList.Add("--outdir");
        start.ArgumentList.Add(outDir);
        start.ArgumentList.Add(inputPath);

        using var process = new Process { StartInfo = start };
        try { process.Start(); }
        catch (System.ComponentModel.Win32Exception ex)
        {
            logger.LogError(ex, "LibreOffice (soffice) could not be started from {Path}.", start.FileName);
            throw new DocumentConversionException("The document converter isn't available right now.");
        }

        var stderr = process.StandardError.ReadToEndAsync(ct);
        _ = process.StandardOutput.ReadToEndAsync(ct);
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
        timeout.CancelAfter(Timeout);
        try { await process.WaitForExitAsync(timeout.Token); }
        catch (OperationCanceledException)
        {
            process.Kill(entireProcessTree: true);
            if (ct.IsCancellationRequested) throw;
            throw new DocumentConversionException("The conversion took too long. Try a smaller document.");
        }

        if (process.ExitCode != 0) logger.LogWarning("soffice exited with {Code}: {Error}", process.ExitCode, await stderr);
    }

    private string SofficePath()
    {
        var configured = configuration["LibreOffice:Path"];
        if (!string.IsNullOrEmpty(configured)) return configured;
        const string mac = "/Applications/LibreOffice.app/Contents/MacOS/soffice";
        return OperatingSystem.IsMacOS() && File.Exists(mac) ? mac : "soffice";
    }

    /// <summary>Cheap magic-byte check so obviously wrong uploads fail fast with a clear message.</summary>
    private static bool LooksLike(string path, string ext)
    {
        var head = new byte[8];
        int read;
        using (var file = File.OpenRead(path)) read = file.Read(head);
        bool Starts(params byte[] magic) => read >= magic.Length && head.AsSpan(0, magic.Length).SequenceEqual(magic);
        return ext switch
        {
            ".pdf" => Starts(0x25, 0x50, 0x44, 0x46),                                    // %PDF
            ".docx" or ".xlsx" or ".pptx" or ".odt" or ".ods" or ".odp" => Starts(0x50, 0x4B), // zip
            ".doc" or ".xls" or ".ppt" => Starts(0xD0, 0xCF, 0x11, 0xE0),                // OLE2
            ".rtf" => Starts(0x7B, 0x5C, 0x72, 0x74, 0x66),                              // {\rtf
            _ => false
        };
    }
}
