"""Admin panels: faculty list, class list + faculty-class assignment, student list. Passwords and reset requests."""
import io, re, secrets
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
import pandas as pd
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from pydantic import BaseModel
from sqlalchemy import select, delete
from sqlalchemy.orm import Session
from .db import get_db
from .deps import roles, class_key
from .models import (User, Student, Faculty, ClassRoom, FacultyClass, ResetRequest, Snapshot, Plan, Note)
from .security import hash_pw
from .email import send_password_email

router = APIRouter(prefix="/admin", tags=["admin panels"])
admin = roles("admin")
ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789"   # no 0/O/1/l/I

def new_password() -> str:
    while True:
        p = "".join(secrets.choice(ALPHABET) for _ in range(8))
        if any(c.isdigit() for c in p) and any(c.isalpha() for c in p): return p

def hash_many(pws):
    with ThreadPoolExecutor() as ex: return list(ex.map(hash_pw, pws))

def pw_view(u):
    if u is None: return {"password": "", "pw_state": "none"}
    if u.initial_pw: return {"password": u.initial_pw, "pw_state": "initial"}
    return {"password": "Changed by user", "pw_state": "changed"}

def issue_password(u) -> str:
    pw = new_password(); u.pw = hash_pw(pw); u.initial_pw = pw; u.must_change = True; return pw

# ---------- sheet reading ----------
def S(v) -> str:
    v = "" if v is None else str(v).strip()
    return v[:-2] if re.fullmatch(r"\d+\.0", v) else v

def norm(h) -> str: return re.sub(r"[^a-z0-9]", "", str(h).lower())

def load_sheet(raw: bytes, filename: str, spec: dict, required: list):
    name = (filename or "").lower()
    try:
        if name.endswith(".xlsx"): df = pd.read_excel(io.BytesIO(raw), dtype=str, keep_default_na=False)
        elif name.endswith(".csv"): df = pd.read_csv(io.BytesIO(raw), dtype=str, keep_default_na=False, encoding="utf-8-sig")
        else: raise HTTPException(400, "Upload an .xlsx or .csv file (save .xls files as .xlsx first).")
    except HTTPException: raise
    except Exception: raise HTTPException(400, "Could not read the file. Check that it is a valid .xlsx or .csv file.")
    df.columns = [norm(c) for c in df.columns]
    cm = {}
    for canon, (_, alts) in spec.items():
        for a in alts:
            if a in df.columns: cm[canon] = a; break
    missing = [spec[c][0] for c in required if c not in cm]
    if missing: raise HTTPException(400, f"Missing column(s): {', '.join(missing)}. Expected: {', '.join(v[0] for v in spec.values())}.")
    return df, cm

def check_mode(mode):
    if mode not in ("replace", "add"): raise HTTPException(400, "mode must be 'replace' or 'add'")

def report(**kw):
    errs = kw.pop("errors", [])
    return {**kw, "error_count": len(errs), "errors": errs[:20]}

def merge_subjects(a: str, b: str) -> str:
    out = []
    for x in [t.strip() for t in re.split(r"[,;/]", f"{a},{b}")]:
        if x and x.lower() not in [o.lower() for o in out]: out.append(x)
    return ", ".join(out)

def all_users(db): return {u.username: u for u in db.scalars(select(User))}

# ================= FACULTY =================
FAC_SPEC = {"sr": ("Sr.No", ["srno", "sr", "serialno"]), "emp_id": ("empID", ["empid", "employeeid", "empno"]),
            "department": ("Department", ["department", "dept"]), "name": ("Faculty-Name", ["facultyname", "name", "faculty"]),
            "subject": ("Subject Teaching", ["subjectteaching", "subject", "subjects"]),
            "email": ("Email", ["email", "emailid", "emailaddress"])}

class FacIn(BaseModel):
    emp_id: str = ""; department: str; name: str; subject: str = ""; email: str = ""

def delete_faculty(db, f):
    db.execute(delete(FacultyClass).where(FacultyClass.faculty_id == f.id))
    db.execute(delete(User).where(User.username == f.emp_id.lower(), User.role == "faculty"))
    db.delete(f)

def fac_dict(f, users, assigned):
    return {"id": f.id, "emp_id": f.emp_id, "department": f.department, "name": f.name, "subject": f.subject or "", "email": f.email or "",
            "classes": assigned.get(f.id, []), **pw_view(users.get(f.emp_id.lower()))}

def class_dict(c): return {"id": c.id, "department": c.department, "semester": c.semester, "name": c.name,
                           "label": f"{c.department} / {c.name}"}

def assigned_map(db):
    m = {}
    for fid, c in db.execute(select(FacultyClass.faculty_id, ClassRoom).join(ClassRoom, ClassRoom.id == FacultyClass.class_id)).all():
        m.setdefault(fid, []).append(class_dict(c))
    return m

@router.get("/faculty")
def list_faculty(db: Session = Depends(get_db), u=Depends(admin)):
    users, am = all_users(db), assigned_map(db)
    return [fac_dict(f, users, am) for f in db.scalars(select(Faculty).order_by(Faculty.id))]

def email_taken(db: Session, email: str, exclude_fac_id: int = None, exclude_stu_id: int = None):
    if not email: return False
    e = email.lower()
    return any(f.id != exclude_fac_id and (f.email or "").lower() == e for f in db.scalars(select(Faculty))) or \
           any(s.id != exclude_stu_id and (s.email or "").lower() == e for s in db.scalars(select(Student)))

@router.post("/faculty/upload")
async def upload_faculty(mode: str = Query(...), file: UploadFile = File(...), db: Session = Depends(get_db), u=Depends(admin)):
    check_mode(mode)
    df, cm = load_sheet(await file.read(), file.filename, FAC_SPEC, ["emp_id", "department", "name"])
    rows, emails_in_file, errors = {}, set(), []
    
    existing_fac_emails = {} if mode == "replace" else {f.email.lower(): f.emp_id for f in db.scalars(select(Faculty)) if f.email}
    existing_stu_emails = set(s.email.lower() for s in db.scalars(select(Student)) if s.email)

    for i, r in df.iterrows():
        g = lambda k: S(r[cm[k]]) if k in cm else ""
        emp, dept, name, subj, email = g("emp_id"), g("department"), g("name"), g("subject"), g("email").strip()
        if not (emp or dept or name or subj): continue
        if not (emp and dept and name): errors.append(f"Row {i + 2}: empID, Department and Faculty-Name are required"); continue
        k = emp.lower()
        e = email.lower() if email else ""
        if e:
            if e in emails_in_file:
                errors.append(f"Row {i + 2}: Email {email} appears more than once in the file"); continue
            if e in existing_stu_emails or (e in existing_fac_emails and existing_fac_emails[e].lower() != k):
                errors.append(f"Row {i + 2}: Email {email} is already in use"); continue
            emails_in_file.add(e)
            
        if k in rows:
            if rows[k]["department"].lower() != dept.lower(): errors.append(f"Row {i + 2}: empID {emp} appears again with a different department")
            else: rows[k]["subject"] = merge_subjects(rows[k]["subject"], subj)
        else: rows[k] = dict(emp_id=emp, department=dept, name=name, subject=subj, email=email)
    existing = {f.emp_id.lower(): f for f in db.scalars(select(Faculty))}
    added = updated = skipped = removed = 0
    if mode == "replace":
        for f in existing.values():
            delete_faculty(db, f); removed += 1
        db.flush()
        existing = {}
    for k, v in rows.items():
        f = existing.get(k)
        if f and mode == "add": skipped += 1
        elif f: f.department, f.name, f.subject, f.email = v["department"], v["name"], v["subject"], v["email"]; updated += 1
        else: db.add(Faculty(**v)); added += 1
    db.commit()
    return report(mode=mode, added=added, updated=updated, skipped_duplicates=skipped, removed=removed, errors=errors)

def fac_clean(b: FacIn):
    emp, dept, name = b.emp_id.strip(), b.department.strip(), b.name.strip()
    if not (dept and name): raise HTTPException(400, "Department and Faculty-Name are required")
    return emp, dept, name, b.subject.strip(), b.email.strip()

@router.post("/faculty")
def add_faculty(b: FacIn, db: Session = Depends(get_db), u=Depends(admin)):
    emp, dept, name, subj, email = fac_clean(b)
    if not emp: raise HTTPException(400, "empID is required")
    if db.scalar(select(Faculty).where(Faculty.emp_id.ilike(emp))): raise HTTPException(409, "A faculty member with this empID already exists")
    if email_taken(db, email): raise HTTPException(409, "This email is already in use")
    db.add(Faculty(emp_id=emp, department=dept, name=name, subject=subj, email=email)); db.commit(); return {"ok": True}

@router.put("/faculty/{fid}")
def edit_faculty(fid: int, b: FacIn, db: Session = Depends(get_db), u=Depends(admin)):
    f = db.get(Faculty, fid)
    if not f: raise HTTPException(404, "Not found")
    _, dept, name, subj, email = fac_clean(b)          # empID is the login id and cannot be edited
    if email_taken(db, email, exclude_fac_id=fid): raise HTTPException(409, "This email is already in use")
    f.department, f.name, f.subject, f.email = dept, name, subj, email
    usr = db.scalar(select(User).where(User.username == f.emp_id.lower(), User.role == "faculty"))
    if usr: usr.name = name
    db.commit(); return {"ok": True}

@router.delete("/faculty/{fid}")
def remove_faculty(fid: int, db: Session = Depends(get_db), u=Depends(admin)):
    f = db.get(Faculty, fid)
    if not f: raise HTTPException(404, "Not found")
    delete_faculty(db, f); db.commit(); return {"ok": True}

@router.post("/faculty/generate-passwords")
def generate_faculty_passwords(db: Session = Depends(get_db), u=Depends(admin)):
    users = all_users(db); todo, conflicts = [], []
    for f in db.scalars(select(Faculty).order_by(Faculty.id)):
        k = f.emp_id.lower()
        if k not in users: todo.append((k, f))
        elif users[k].role != "faculty": conflicts.append(f.emp_id)
    pws = [new_password() for _ in todo]
    for (k, f), pw, h in zip(todo, pws, hash_many(pws)):
        db.add(User(username=k, name=f.name, pw=h, role="faculty", initial_pw=pw, must_change=True, email_sent=False))
    db.commit()
    return {"generated": len(todo), "id_conflicts": conflicts}

@router.post("/faculty/send-emails")
def send_faculty_emails(db: Session = Depends(get_db), u=Depends(admin)):
    users = all_users(db)
    sent = 0
    for f in db.scalars(select(Faculty)):
        k = f.emp_id.lower()
        usr = users.get(k)
        if usr and usr.role == "faculty" and usr.initial_pw and not usr.email_sent:
            if f.email:
                send_password_email(f.email, f.name, k, usr.initial_pw)
                usr.email_sent = True
                sent += 1
    db.commit()
    return {"sent": sent}

# ================= CLASSES + ASSIGNMENT =================
CLS_SPEC = {"department": ("Department", ["department", "dept"]), "semester": ("Semester", ["semester", "sem"]),
            "name": ("Class", ["class", "classname", "division"])}

class ClsIn(BaseModel):
    department: str; semester: int; name: str

def parse_sem(v):
    m = re.search(r"\d+", v or "")
    return int(m.group()) if m else None

def cls_key(d, s, n): return (d.strip().lower(), int(s), n.strip().lower())

@router.get("/classes")
def list_classes(db: Session = Depends(get_db), u=Depends(admin)):
    return [class_dict(c) for c in db.scalars(select(ClassRoom).order_by(ClassRoom.semester, ClassRoom.department, ClassRoom.name))]

@router.post("/classes/upload")
async def upload_classes(mode: str = Query(...), file: UploadFile = File(...), db: Session = Depends(get_db), u=Depends(admin)):
    check_mode(mode)
    df, cm = load_sheet(await file.read(), file.filename, CLS_SPEC, ["department", "semester", "name"])
    rows, errors = {}, []
    for i, r in df.iterrows():
        d, sv, n = S(r[cm["department"]]), S(r[cm["semester"]]), S(r[cm["name"]])
        if not (d or sv or n): continue
        sem = parse_sem(sv)
        if not (d and n) or sem is None: errors.append(f"Row {i + 2}: Department, a numeric Semester and Class are required"); continue
        rows.setdefault(cls_key(d, sem, n), dict(department=d, semester=sem, name=n))
    existing = {cls_key(c.department, c.semester, c.name): c for c in db.scalars(select(ClassRoom))}
    added = skipped = removed = 0
    if mode == "replace":
        for c in existing.values():
            db.execute(delete(FacultyClass).where(FacultyClass.class_id == c.id)); db.delete(c); removed += 1
        db.flush()
        existing = {}
    for k, v in rows.items():
        if k in existing: skipped += 1
        else: db.add(ClassRoom(**v)); added += 1
    db.commit()
    return report(mode=mode, added=added, skipped_duplicates=skipped, removed=removed, errors=errors)

def cls_clean(b: ClsIn):
    d, n = b.department.strip(), b.name.strip()
    if not (d and n): raise HTTPException(400, "Department and Class are required")
    return d, b.semester, n

@router.post("/classes")
def add_class(b: ClsIn, db: Session = Depends(get_db), u=Depends(admin)):
    d, s, n = cls_clean(b)
    if any(cls_key(c.department, c.semester, c.name) == cls_key(d, s, n) for c in db.scalars(select(ClassRoom))):
        raise HTTPException(409, "This class already exists")
    db.add(ClassRoom(department=d, semester=s, name=n)); db.commit(); return {"ok": True}

@router.put("/classes/{cid}")
def edit_class(cid: int, b: ClsIn, db: Session = Depends(get_db), u=Depends(admin)):
    c = db.get(ClassRoom, cid)
    if not c: raise HTTPException(404, "Not found")
    d, s, n = cls_clean(b)
    if any(o.id != cid and cls_key(o.department, o.semester, o.name) == cls_key(d, s, n) for o in db.scalars(select(ClassRoom))):
        raise HTTPException(409, "This class already exists")
    c.department, c.semester, c.name = d, s, n; db.commit(); return {"ok": True}

@router.delete("/classes/{cid}")
def remove_class(cid: int, db: Session = Depends(get_db), u=Depends(admin)):
    c = db.get(ClassRoom, cid)
    if not c: raise HTTPException(404, "Not found")
    db.execute(delete(FacultyClass).where(FacultyClass.class_id == cid)); db.delete(c); db.commit(); return {"ok": True}

class Assign(BaseModel):
    class_ids: list[int]

@router.put("/faculty/{fid}/classes")
def assign_classes(fid: int, b: Assign, db: Session = Depends(get_db), u=Depends(admin)):
    if not db.get(Faculty, fid): raise HTTPException(404, "Not found")
    ids = set(b.class_ids); found = {c.id for c in db.scalars(select(ClassRoom).where(ClassRoom.id.in_(ids)))} if ids else set()
    if found != ids: raise HTTPException(400, "Some selected classes no longer exist")
    db.execute(delete(FacultyClass).where(FacultyClass.faculty_id == fid))
    for cid in ids: db.add(FacultyClass(faculty_id=fid, class_id=cid))
    db.commit(); return {"ok": True}

# ================= STUDENTS =================
STU_SPEC = {"sr": ("Sr.No", ["srno", "sr", "serialno"]),
            "enrollment": ("Enrollment Number", ["enrollmentnumber", "enrollmentno", "enrollment", "enrolmentnumber", "enrolmentno"]),
            "gr": ("GR Number", ["grnumber", "grno", "gr"]), "name": ("Name", ["name", "studentname"]),
            "class": ("Class", ["class", "classname", "division"]), "department": ("Department", ["department", "dept"]),
            "email": ("Email", ["email", "emailid", "emailaddress"])}

class StuIn(BaseModel):
    student_id: str = ""; gr_number: str = ""; name: str; department: str; class_code: str; subjects: list[str] = []; email: str = ""

def trim_subjects(subs):
    subs = [S(x) for x in subs]
    while subs and not subs[-1]: subs.pop()
    return subs

def delete_student(db, st):
    db.execute(delete(Snapshot).where(Snapshot.student_pk == st.id)); db.execute(delete(Plan).where(Plan.student_pk == st.id))
    db.execute(delete(Note).where(Note.student_pk == st.id))
    db.execute(delete(User).where(User.username == st.student_id.lower(), User.role == "student")); db.delete(st)

def faculty_index(db):
    """(subject, class key) -> faculty names, from the faculty list and the class assignments."""
    idx, fac = {}, {f.id: f for f in db.scalars(select(Faculty))}
    for fid, c in db.execute(select(FacultyClass.faculty_id, ClassRoom).join(ClassRoom, ClassRoom.id == FacultyClass.class_id)).all():
        f = fac.get(fid)
        for sub in [t.strip().lower() for t in re.split(r"[,;/]", f.subject or "") if t.strip()] if f else []:
            idx.setdefault((sub, class_key(c.department, c.name)), []).append(f.name)
    return idx

def stu_dict(s, users, idx):
    k = class_key(s.branch, s.class_code)
    return {"id": s.id, "student_id": s.student_id, "gr_number": s.gr_number or "", "name": s.name, "department": s.branch,
            "class_code": s.class_code or "", "email": s.email or "", "subjects": [{"subject": x, "faculty": idx.get((x.strip().lower(), k), []) if x else []} for x in (s.subjects or [])],
            **pw_view(users.get(s.student_id.lower()))}

@router.get("/students")
def list_students(db: Session = Depends(get_db), u=Depends(admin)):
    users, idx = all_users(db), faculty_index(db)
    return [stu_dict(s, users, idx) for s in db.scalars(select(Student).order_by(Student.id))]

@router.post("/students/upload")
async def upload_students(mode: str = Query(...), file: UploadFile = File(...), db: Session = Depends(get_db), u=Depends(admin)):
    check_mode(mode)
    df, cm = load_sheet(await file.read(), file.filename, STU_SPEC, ["enrollment", "name", "class", "department"])
    sub_cols = [c for c in df.columns if c.startswith("subject")]
    rows, grs, emails_in_file, errors = {}, set(), set(), []
    
    existing_stu_emails = {} if mode == "replace" else {s.email.lower(): s.student_id for s in db.scalars(select(Student)) if s.email}
    existing_fac_emails = set(f.email.lower() for f in db.scalars(select(Faculty)) if f.email)

    for i, r in df.iterrows():
        g = lambda k: S(r[cm[k]]) if k in cm else ""
        enr, gr, name, cls, dept, email = g("enrollment"), g("gr"), g("name"), g("class"), g("department"), g("email").strip()
        subs = trim_subjects([r[c] for c in sub_cols])
        if not (enr or gr or name or cls or dept or subs): continue
        if not (enr and name and cls and dept): errors.append(f"Row {i + 2}: Enrollment Number, Name, Class and Department are required"); continue
        k = enr.lower()
        if k in rows: errors.append(f"Row {i + 2}: Enrollment Number {enr} appears more than once in the file"); continue
        if gr and gr.lower() in grs: errors.append(f"Row {i + 2}: GR Number {gr} appears more than once in the file"); continue
        
        e = email.lower() if email else ""
        if e:
            if e in emails_in_file:
                errors.append(f"Row {i + 2}: Email {email} appears more than once in the file"); continue
            if e in existing_fac_emails or (e in existing_stu_emails and existing_stu_emails[e].lower() != k):
                errors.append(f"Row {i + 2}: Email {email} is already in use"); continue
            emails_in_file.add(e)
            
        rows[k] = dict(student_id=enr, gr_number=gr or None, name=name, branch=dept, class_code=cls, subjects=subs, email=email)
        if gr: grs.add(gr.lower())
    existing = {s.student_id.lower(): s for s in db.scalars(select(Student))}
    added = updated = skipped = removed = 0
    if mode == "replace":
        for s in existing.values():
            delete_student(db, s); removed += 1
        db.flush()
        existing = {}
    
    gr_owner = {s.gr_number.lower(): s.student_id for s in existing.values() if s.gr_number}
    for k, v in rows.items():
        s = existing.get(k)
        if s and mode == "add": skipped += 1
        elif s:
            for a, b in v.items():
                if a != "student_id": setattr(s, a, b)
            updated += 1
        elif v["gr_number"] and gr_owner.get(v["gr_number"].lower()) not in (None, v["student_id"]):
            errors.append(f"{v['student_id']}: GR Number {v['gr_number']} already belongs to {gr_owner[v['gr_number'].lower()]}"); skipped += 1
        else: db.add(Student(**v)); added += 1
    db.flush()
    for s in db.scalars(select(Student)):
        usr = db.scalar(select(User).where(User.username == s.student_id.lower(), User.role == "student"))
        if usr and usr.name != s.name: usr.name = s.name
    db.commit()
    return report(mode=mode, added=added, updated=updated, skipped_duplicates=skipped, removed=removed, errors=errors)

def stu_clean(b: StuIn):
    name, dept, cls = b.name.strip(), b.department.strip(), b.class_code.strip()
    if not (name and dept and cls): raise HTTPException(400, "Name, Department and Class are required")
    return name, dept, cls, (b.gr_number.strip() or None), trim_subjects(b.subjects), b.email.strip()

def gr_taken(db, gr, exclude_id=None):
    return bool(gr) and any(s.id != exclude_id and (s.gr_number or "").lower() == gr.lower() for s in db.scalars(select(Student)))

@router.post("/students")
def add_student(b: StuIn, db: Session = Depends(get_db), u=Depends(admin)):
    name, dept, cls, gr, subs, email = stu_clean(b); enr = b.student_id.strip()
    if not enr: raise HTTPException(400, "Enrollment Number is required")
    if db.scalar(select(Student).where(Student.student_id.ilike(enr))): raise HTTPException(409, "This Enrollment Number already exists")
    if gr_taken(db, gr): raise HTTPException(409, "This GR Number already exists")
    if email_taken(db, email): raise HTTPException(409, "This email is already in use")
    db.add(Student(student_id=enr, gr_number=gr, name=name, branch=dept, class_code=cls, subjects=subs, email=email)); db.commit(); return {"ok": True}

@router.put("/students/{sid}")
def edit_student(sid: int, b: StuIn, db: Session = Depends(get_db), u=Depends(admin)):
    s = db.get(Student, sid)
    if not s: raise HTTPException(404, "Not found")
    name, dept, cls, gr, subs, email = stu_clean(b)      # Enrollment Number is the login id and cannot be edited
    if gr_taken(db, gr, sid): raise HTTPException(409, "This GR Number already exists")
    if email_taken(db, email, exclude_stu_id=sid): raise HTTPException(409, "This email is already in use")
    s.name, s.branch, s.class_code, s.gr_number, s.subjects, s.email = name, dept, cls, gr, subs, email
    usr = db.scalar(select(User).where(User.username == s.student_id.lower(), User.role == "student"))
    if usr: usr.name = name
    db.commit(); return {"ok": True}

@router.delete("/students/{sid}")
def remove_student(sid: int, db: Session = Depends(get_db), u=Depends(admin)):
    s = db.get(Student, sid)
    if not s: raise HTTPException(404, "Not found")
    delete_student(db, s); db.commit(); return {"ok": True}

@router.post("/students/generate-passwords")
def generate_student_passwords(db: Session = Depends(get_db), u=Depends(admin)):
    users = all_users(db); todo, conflicts = [], []
    for s in db.scalars(select(Student).order_by(Student.id)):
        k = s.student_id.lower()
        if k not in users: todo.append((k, s))
        elif users[k].role != "student": conflicts.append(s.student_id)
    pws = [new_password() for _ in todo]
    for (k, s), pw, h in zip(todo, pws, hash_many(pws)):
        db.add(User(username=k, name=s.name, pw=h, role="student", student_id=s.student_id, initial_pw=pw, must_change=True, email_sent=False))
    db.commit()
    return {"generated": len(todo), "id_conflicts": conflicts}

@router.post("/students/send-emails")
def send_student_emails(db: Session = Depends(get_db), u=Depends(admin)):
    users = all_users(db)
    sent = 0
    for s in db.scalars(select(Student)):
        k = s.student_id.lower()
        usr = users.get(k)
        if usr and usr.role == "student" and usr.initial_pw and not usr.email_sent:
            if s.email:
                send_password_email(s.email, s.name, k, usr.initial_pw)
                usr.email_sent = True
                sent += 1
    db.commit()
    return {"sent": sent}

# ================= PASSWORD RESET =================
class Who(BaseModel):
    username: str

@router.get("/reset-requests")
def reset_requests(db: Session = Depends(get_db), u=Depends(admin)):
    users = all_users(db)
    return [{"id": r.id, "username": r.username, "name": users[r.username].name if r.username in users else "", "role": r.role,
             "status": r.status, "created_at": r.created_at.isoformat(), "handled_at": r.handled_at.isoformat() if r.handled_at else None}
            for r in db.scalars(select(ResetRequest).order_by(ResetRequest.id.desc()).limit(200))]

def pending_request(db, rid):
    r = db.get(ResetRequest, rid)
    if not r or r.status != "pending": raise HTTPException(404, "No pending request with this id")
    return r

@router.post("/reset-requests/{rid}/approve")
def approve_reset(rid: int, db: Session = Depends(get_db), u=Depends(admin)):
    r = pending_request(db, rid)
    usr = db.scalar(select(User).where(User.username == r.username, User.role.in_(["faculty", "student"])))
    r.handled_by, r.handled_at = u.username, datetime.utcnow()
    if not usr: r.status = "rejected"; db.commit(); raise HTTPException(404, "This account no longer exists")
    pw = issue_password(usr); r.status = "approved"; db.commit()
    return {"username": r.username, "password": pw}

@router.post("/reset-requests/{rid}/reject")
def reject_reset(rid: int, db: Session = Depends(get_db), u=Depends(admin)):
    r = pending_request(db, rid); r.status, r.handled_by, r.handled_at = "rejected", u.username, datetime.utcnow(); db.commit(); return {"ok": True}

@router.post("/accounts/reset-password")
def reset_password(b: Who, db: Session = Depends(get_db), u=Depends(admin)):
    usr = db.scalar(select(User).where(User.username == b.username.strip().lower(), User.role.in_(["faculty", "student"])))
    if not usr: raise HTTPException(404, "No faculty or student account with this id")
    pw = issue_password(usr)
    for r in db.scalars(select(ResetRequest).where(ResetRequest.username == usr.username, ResetRequest.status == "pending")):
        r.status, r.handled_by, r.handled_at = "approved", u.username, datetime.utcnow()
    db.commit(); return {"username": usr.username, "password": pw}
