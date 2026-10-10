import os, time, hmac, hashlib
import jwt

SECRET = os.getenv("JWT_SECRET", "change-me-in-production")

def hash_pw(p: str, salt: str | None = None) -> str:
    salt = salt or os.urandom(16).hex()
    h = hashlib.pbkdf2_hmac("sha256", p.encode(), bytes.fromhex(salt), 200_000).hex()
    return f"{salt}${h}"

def verify_pw(p: str, stored: str) -> bool:
    salt, h = stored.split("$")
    return hmac.compare_digest(hash_pw(p, salt).split("$")[1], h)

def make_token(email: str, role: str) -> str:
    return jwt.encode({"sub": email, "role": role, "exp": time.time() + 8 * 3600}, SECRET, "HS256")

def read_token(tok: str) -> dict:
    return jwt.decode(tok, SECRET, algorithms=["HS256"])
