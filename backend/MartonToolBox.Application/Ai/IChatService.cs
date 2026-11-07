namespace MartonToolBox.Application.Ai;

/// <summary>One turn of a conversation. Role is "user" or "assistant" (the system prompt is added by the service).</summary>
public sealed record ChatMessage(string Role, string Content);

/// <summary>Whether the model server is reachable and has the configured model downloaded.</summary>
public sealed record ChatStatus(bool Available, string Model, string? Problem);

/// <summary>The model server is down or refused the request; the message is safe to show to the user.</summary>
public sealed class ChatUnavailableException(string message, Exception? inner = null) : Exception(message, inner);

public interface IChatService
{
    Task<ChatStatus> GetStatusAsync(CancellationToken cancellationToken = default);

    /// <summary>Streams the assistant's reply as text fragments, in order. The meter gets the token counts the model reports at the end.</summary>
    IAsyncEnumerable<string> StreamReplyAsync(IReadOnlyList<ChatMessage> messages, ChatUsageMeter? usage = null, CancellationToken cancellationToken = default);
}
