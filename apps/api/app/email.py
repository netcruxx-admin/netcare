"""Outbound email — Resend (primary) with smtplib fallback.

Priority:
  1. RESEND_API_KEY set  → uses Resend HTTPS API (works from any cloud server)
  2. SMTP_HOST set       → falls back to smtplib (useful for self-hosted / local)
  3. Neither set         → prints the link to the console (dev mode)
"""

import logging
import smtplib
import ssl
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

import certifi

from .config import settings

log = logging.getLogger(__name__)


def _send_via_resend(to_address: str, subject: str, html: str, plain: str) -> None:
    import resend  # installed via requirements.txt
    resend.api_key = settings.resend_api_key
    sender = settings.resend_from or settings.smtp_from or "NetCare <onboarding@resend.dev>"
    resend.Emails.send({
        "from": sender,
        "to": [to_address],
        "subject": subject,
        "html": html,
        "text": plain,
    })


def _send_via_smtp(to_address: str, subject: str, html: str, plain: str) -> None:
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = settings.smtp_from or settings.smtp_user
    msg["To"] = to_address
    msg.attach(MIMEText(plain, "plain"))
    msg.attach(MIMEText(html, "html"))

    context = ssl.create_default_context(cafile=certifi.where())

    # 15-second timeout so a blocked host fails fast instead of hanging for minutes.
    if settings.smtp_use_ssl:
        with smtplib.SMTP_SSL(settings.smtp_host, settings.smtp_port, context=context, timeout=15) as server:
            server.login(settings.smtp_user, settings.smtp_password)
            server.sendmail(msg["From"], to_address, msg.as_string())
    else:
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=15) as server:
            if settings.smtp_use_tls:
                server.starttls(context=context)
            server.login(settings.smtp_user, settings.smtp_password)
            server.sendmail(msg["From"], to_address, msg.as_string())


def _send(to_address: str, subject: str, html: str, plain: str) -> None:
    if settings.resend_api_key:
        _send_via_resend(to_address, subject, html, plain)
    else:
        _send_via_smtp(to_address, subject, html, plain)


def send_password_reset(to_address: str, reset_url: str, hospital_name: str = "NetCare") -> None:
    """Send the reset-password email.

    If SMTP is not configured, prints the link to the console so development
    can exercise the full flow without a mail server.
    """
    subject = f"Reset your {hospital_name} password"

    plain = f"""\
Hi,

Someone requested a password reset for this account on {hospital_name}.
If that was you, click the link below (valid for 1 hour):

{reset_url}

If you did not request this, you can safely ignore this email.
Your password will not change unless you follow the link above.

— The {hospital_name} team
"""

    html = f"""\
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f0fdfa;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0fdfa;padding:40px 0;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0"
             style="background:#ffffff;border-radius:12px;border:1px solid #99f6e4;
                    box-shadow:0 4px 24px rgba(20,184,166,.08);overflow:hidden;">
        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#06b6d4,#14b8a6);padding:32px 40px;">
            <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:-0.3px;">
              {hospital_name}
            </h1>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:36px 40px;">
            <h2 style="margin:0 0 12px;color:#0f172a;font-size:20px;">Reset your password</h2>
            <p style="margin:0 0 20px;color:#475569;font-size:15px;line-height:1.6;">
              We received a request to reset the password for your account.
              Click the button below to choose a new password.
              This link is valid for&nbsp;<strong>1&nbsp;hour</strong>.
            </p>
            <table cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
              <tr>
                <td style="border-radius:8px;background:linear-gradient(135deg,#06b6d4,#14b8a6);">
                  <a href="{reset_url}"
                     style="display:block;padding:14px 32px;color:#ffffff;font-size:15px;
                            font-weight:600;text-decoration:none;border-radius:8px;">
                    Reset password
                  </a>
                </td>
              </tr>
            </table>
            <p style="margin:0 0 8px;color:#64748b;font-size:13px;">
              Or copy and paste this URL into your browser:
            </p>
            <p style="margin:0 0 24px;color:#0ea5e9;font-size:13px;word-break:break-all;">
              <a href="{reset_url}" style="color:#0ea5e9;">{reset_url}</a>
            </p>
            <hr style="border:none;border-top:1px solid #e2e8f0;margin:0 0 24px;">
            <p style="margin:0;color:#94a3b8;font-size:13px;line-height:1.6;">
              If you did not request a password reset, you can ignore this email —
              your password will not change.
            </p>
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="background:#f8fafc;padding:20px 40px;border-top:1px solid #e2e8f0;">
            <p style="margin:0;color:#94a3b8;font-size:12px;">
              &copy; {hospital_name}. This is an automated message — please do not reply.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>
"""

    if not settings.smtp_host:
        # Dev fallback: print link so the flow is fully testable without a
        # mail server. Never reached in production (SMTP_HOST will be set).
        log.warning(
            "[DEV] SMTP not configured — password reset link for %s:\n%s",
            to_address,
            reset_url,
        )
        return

    try:
        _send(to_address, subject, html, plain)
        log.info("Password reset email sent to %s", to_address)
    except Exception:
        log.exception("Failed to send password reset email to %s", to_address)
        raise
