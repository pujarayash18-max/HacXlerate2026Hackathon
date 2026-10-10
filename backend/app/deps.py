"""Authentication and access rules shared by all routers."""
from fastapi import Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import select, func
from sqlalchemy.orm import Session
from .db import get_db
from .models import User, Student, Faculty, ClassRoom, FacultyClass
from .security import read_token

oauth = OAuth2PasswordBearer(tokenUrl="auth/login")

def class_key(department, name) -> str:
    return f"{department or ''}|{name or ''}".strip().lower()

def current_any(tok: str = Depends(oauth), db: Session = Depends(get_db)) -> User:
    """Signed-in user, even if a password change is still pending."""
    try: sub = read_token(tok)["sub"]
    except Exception: raise HTTPException(401, "Invalid or expired token")
    u = db.scalar(select(User).where(User.username == sub))
    if not u: raise HTTPException(401, "Unknown user")
    u.class_keys = set()
    if u.role == "faculty":
        fac = db.scalar(select(Faculty).where(func.lower(Faculty.emp_id) == u.username))
        if fac:
            rows = db.execute(select(ClassRoom.department, ClassRoom.name).join(FacultyClass, FacultyClass.class_id == ClassRoom.id)
                              .where(FacultyClass.faculty_id == fac.id)).all()
            u.class_keys = {class_key(d, n) for d, n in rows}
    return u

def current(u: User = Depends(current_any)) -> User:
    if u.must_change: raise HTTPException(403, "password_change_required")
    return u

def roles(*allowed_roles):
    def dep(u: User = Depends(current)):
        if u.role not in allowed_roles: raise HTTPException(403, "Not permitted for your role")
        return u
    return dep

def allowed(u: User, st: Student) -> bool:
    if not st.consent: return False
    if u.role == "student": return u.student_id == st.student_id
    if u.role == "faculty": return class_key(st.branch, st.class_code) in getattr(u, "class_keys", set())
    if u.role == "mentor": return (st.mentor_email or "") == u.username
    return False   # admins never see individual academic records
