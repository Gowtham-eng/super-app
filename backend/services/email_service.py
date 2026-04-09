import os
import logging
import aiosmtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

logger = logging.getLogger(__name__)


def _smtp_config():
    return {
        "host": os.environ.get("SMTP_HOST"),
        "port": int(os.environ.get("SMTP_PORT", "587")),
        "user": os.environ.get("SMTP_USER"),
        "password": os.environ.get("SMTP_PASSWORD"),
        "from_addr": os.environ.get("SMTP_FROM"),
    }


async def send_email(to_emails: list, subject: str, html_body: str):
    """Send email via SMTP (Zoho)"""
    cfg = _smtp_config()
    if not all([cfg["host"], cfg["user"], cfg["password"]]):
        logger.error("SMTP not configured, skipping email")
        return False

    msg = MIMEMultipart("alternative")
    msg["From"] = f"Refex Super App <{cfg['from_addr']}>"
    msg["To"] = ", ".join(to_emails)
    msg["Subject"] = subject
    msg.attach(MIMEText(html_body, "html"))

    try:
        await aiosmtplib.send(
            msg,
            hostname=cfg["host"],
            port=cfg["port"],
            username=cfg["user"],
            password=cfg["password"],
            start_tls=True,
        )
        logger.info(f"Email sent to {to_emails}: {subject}")
        return True
    except Exception as e:
        logger.error(f"Failed to send email to {to_emails}: {e}")
        return False


def build_access_request_email(requester_name: str, requester_email: str, app_name: str, reason: str, approve_url: str):
    return f"""
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: #10b981; padding: 24px 32px; border-radius: 12px 12px 0 0;">
        <h1 style="color: white; margin: 0; font-size: 20px;">Refex Super App</h1>
        <p style="color: rgba(255,255,255,0.85); margin: 4px 0 0; font-size: 14px;">Application Access Request</p>
      </div>
      <div style="background: white; padding: 32px; border: 1px solid #e2e8f0; border-top: none;">
        <p style="color: #334155; font-size: 15px; line-height: 1.6; margin-top: 0;">
          <strong>{requester_name}</strong> ({requester_email}) has requested access to:
        </p>
        <div style="background: #f8fafc; border-left: 4px solid #10b981; padding: 16px 20px; margin: 16px 0; border-radius: 0 8px 8px 0;">
          <p style="margin: 0; font-size: 16px; font-weight: 600; color: #1e293b;">{app_name}</p>
          {f'<p style="margin: 8px 0 0; font-size: 13px; color: #64748b;">Reason: {reason}</p>' if reason else ''}
        </div>
        <p style="color: #64748b; font-size: 13px;">
          Please log in to the admin panel to approve or reject this request.
        </p>
        <a href="{approve_url}" style="display: inline-block; background: #10b981; color: white; padding: 12px 28px; text-decoration: none; border-radius: 8px; font-size: 14px; font-weight: 600; margin-top: 8px;">
          Review Request
        </a>
      </div>
      <div style="padding: 16px 32px; text-align: center;">
        <p style="color: #94a3b8; font-size: 12px; margin: 0;">Sent from Refex Super App IAM System</p>
      </div>
    </div>
    """


def build_request_status_email(user_name: str, app_name: str, status: str, admin_name: str):
    color = "#10b981" if status == "approved" else "#ef4444"
    status_text = "Approved" if status == "approved" else "Rejected"
    return f"""
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: {color}; padding: 24px 32px; border-radius: 12px 12px 0 0;">
        <h1 style="color: white; margin: 0; font-size: 20px;">Refex Super App</h1>
        <p style="color: rgba(255,255,255,0.85); margin: 4px 0 0; font-size: 14px;">Access Request {status_text}</p>
      </div>
      <div style="background: white; padding: 32px; border: 1px solid #e2e8f0; border-top: none;">
        <p style="color: #334155; font-size: 15px; line-height: 1.6; margin-top: 0;">
          Hi {user_name},
        </p>
        <p style="color: #334155; font-size: 15px; line-height: 1.6;">
          Your access request for <strong>{app_name}</strong> has been <strong style="color: {color};">{status_text}</strong> by {admin_name}.
        </p>
        {'<p style="color: #64748b; font-size: 13px;">You can now access the application from the App Launcher.</p>' if status == "approved" else ''}
      </div>
      <div style="padding: 16px 32px; text-align: center;">
        <p style="color: #94a3b8; font-size: 12px; margin: 0;">Sent from Refex Super App IAM System</p>
      </div>
    </div>
    """


def build_sync_report_email(created: int, disabled: int, total: int, errors: list):
    error_rows = ""
    for e in errors[:10]:
        error_rows += f'<li style="color: #64748b; font-size: 13px; margin: 4px 0;">{e}</li>'

    return f"""
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: #3b82f6; padding: 24px 32px; border-radius: 12px 12px 0 0;">
        <h1 style="color: white; margin: 0; font-size: 20px;">Refex Super App</h1>
        <p style="color: rgba(255,255,255,0.85); margin: 4px 0 0; font-size: 14px;">HR Sync Report</p>
      </div>
      <div style="background: white; padding: 32px; border: 1px solid #e2e8f0; border-top: none;">
        <table style="width: 100%; border-collapse: collapse;">
          <tr><td style="padding: 8px 0; color: #64748b;">Total Employees from Adrenalin</td><td style="font-weight: 600; text-align: right;">{total}</td></tr>
          <tr><td style="padding: 8px 0; color: #64748b;">New Users Created</td><td style="font-weight: 600; text-align: right; color: #10b981;">{created}</td></tr>
          <tr><td style="padding: 8px 0; color: #64748b;">Users Disabled (Exited)</td><td style="font-weight: 600; text-align: right; color: #f59e0b;">{disabled}</td></tr>
        </table>
        {f'<div style="margin-top: 16px;"><p style="font-weight: 600; color: #ef4444; font-size: 14px;">Errors:</p><ul style="padding-left: 20px;">{error_rows}</ul></div>' if errors else ''}
      </div>
    </div>
    """
