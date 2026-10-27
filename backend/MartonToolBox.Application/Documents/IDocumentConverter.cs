namespace MartonToolBox.Application.Documents;

public sealed record ConvertedDocument(byte[] Content, string FileName, string ContentType);

/// <summary>A conversion the converter refused or couldn't complete; the message is safe to show to the user.</summary>
public sealed class DocumentConversionException(string message) : Exception(message);

public interface IDocumentConverter
{
    /// <summary>Source extensions (".pdf", ".docx", ...) mapped to the target formats each can be converted to.</summary>
    IReadOnlyDictionary<string, IReadOnlyList<string>> SupportedConversions { get; }

    Task<ConvertedDocument> ConvertAsync(Stream input, string fileName, string targetFormat, CancellationToken cancellationToken = default);
}
