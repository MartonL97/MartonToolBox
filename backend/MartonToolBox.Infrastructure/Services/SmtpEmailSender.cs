using MailKit.Net.Smtp;
using MailKit.Security;
using MartonToolBox.Application.Email;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using MimeKit;

namespace MartonToolBox.Infrastructure.Services;

/// <summary>
/// Sends mail through the SMTP server in the "Smtp" config section (e.g. Gmail/Yahoo with an app password).
/// With no Smtp:Host configured it doesn't send anything and logs the email instead, so local development
/// works before credentials exist - confirmation links can then be copied from the backend log.
/// </summary>
public sealed class SmtpEmailSender(IConfiguration configuration, ILogger<SmtpEmailSender> logger) : IEmailSender
{
    public async Task SendAsync(string toEmail, string toName, string subject, string htmlBody, string textBody, CancellationToken ct = default)
    {
        var smtp = configuration.GetSection("Smtp");
        var host = smtp["Host"];
        if (string.IsNullOrWhiteSpace(host))
        {
            logger.LogWarning("SMTP is not configured (Smtp:Host is empty), so this email was NOT sent.\nTo: {To}\nSubject: {Subject}\n{Body}", toEmail, subject, textBody);
            return;
        }

        var fromEmail = smtp["FromEmail"] is { Length: > 0 } f ? f : smtp["Username"]!;
        var message = new MimeMessage();
        message.From.Add(new MailboxAddress(smtp["FromName"] ?? "MartonToolBox", fromEmail));
        message.To.Add(new MailboxAddress(toName, toEmail));
        message.Subject = subject;
        message.Body = new BodyBuilder { HtmlBody = htmlBody, TextBody = textBody }.ToMessageBody();

        var port = smtp.GetValue("Port", 587);
        // Port 465 is implicit TLS; 587 (and most others) upgrade with STARTTLS.
        var security = port == 465 ? SecureSocketOptions.SslOnConnect : SecureSocketOptions.StartTls;

        // The certificate chain, host name and expiry are still fully validated. Only the online revocation
        // lookup is skipped: it often can't complete (notably on macOS), which makes MailKit reject valid
        // certificates such as Gmail's with "incomplete certificate revocation check".
        using var client = new SmtpClient { Timeout = 20_000, CheckCertificateRevocation = false };
        await client.ConnectAsync(host, port, security, ct);
        if (!string.IsNullOrEmpty(smtp["Username"])) await client.AuthenticateAsync(smtp["Username"], smtp["Password"], ct);
        await client.SendAsync(message, ct);
        await client.DisconnectAsync(true, ct);
    }
}
