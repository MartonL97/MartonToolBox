namespace MartonToolBox.Application.Email;

public interface IEmailSender
{
    /// <summary>Sends an email with an HTML body and a plain-text alternative. Throws if sending fails.</summary>
    Task SendAsync(string toEmail, string toName, string subject, string htmlBody, string textBody, CancellationToken cancellationToken = default);
}
