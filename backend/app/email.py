import os
import httpx

def send_password_email(to_email: str, name: str, user_id: str, password: str):
    api_key = os.environ.get("BREVO_API_KEY")
    print(f"[EMAIL DEBUG] Sending to {to_email}. API Key present: {bool(api_key)}")
    if not api_key or not to_email:
        print("[EMAIL DEBUG] Aborting: Missing api_key or to_email")
        return
    url = "https://api.brevo.com/v3/smtp/email"
    headers = {
        "accept": "application/json",
        "api-key": api_key,
        "content-type": "application/json"
    }
    payload = {
        "sender": {"name": "Student Success Platform", "email": "pujarayash3122@gmail.com"},
        "to": [{"email": to_email, "name": name}],
        "subject": "Your Account Credentials",
        "htmlContent": f"<p>Hello {name},</p><p>Your account has been created.</p><p><strong>User ID:</strong> {user_id}<br/><strong>Temporary Password:</strong> {password}</p><p>Please log in and change your password.</p>"
    }
    try:
        response = httpx.post(url, json=payload, headers=headers, timeout=5.0)
        print(f"[EMAIL DEBUG] Response Status: {response.status_code}")
        print(f"[EMAIL DEBUG] Response Text: {response.text}")
        response.raise_for_status()
    except Exception as e:
        print("[EMAIL DEBUG] Failed to send email:", e)
