import json, os, time
from datetime import datetime
from typing import Optional
from fastapi import FastAPI, Depends, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session
from . import ml, ingest as ing
from .db import Base, engine, get_db, SessionLocal
from .models import User, Student, Snapshot, Plan, Note, Audit, Insight, ResetRequest
from .deps import current, current_any, roles, allowed
from .panels import router as panels_router
from .security import hash_pw, verify_pw, make_token, read_token

app = FastAPI(title="AI-Powered Student Analytics and Success Platform")
app.include_router(panels_router)
app.add_middleware(CORSMiddleware, allow_origins=os.getenv("CORS_ORIGINS", "http://localhost:3000").split(","),
                   allow_methods=["*"], allow_headers=["*"])
STAFF = ("faculty", "mentor")

@app.on_event("startup")
def startup():
    Base.metadata.create_all(engine)
    with SessionLocal() as db:
        em, pw = os.getenv("ADMIN_EMAIL"), os.getenv("ADMIN_PASSWORD")
        if em and pw and not db.scalar(select(User).where(User.username == em.strip().lower())):
            db.add(User(username=em.strip().lower(), name="Administrator", pw=hash_pw(pw), role="admin")); db.commit()

# ---------- stage 4: privacy-by-design (RBAC, audit, consent) ----------

def student_or_404(db, u, sid, action) -> Student:
    st = db.scalar(select(Student).where(Student.student_id == sid))
    if not st or not allowed(u, st): raise HTTPException(404, "Student not found")
    db.add(Audit(user_email=u.username, action=action, student_id=sid)); db.commit()
    return st

# ---------- auth / users ----------
FAILS: dict = {}   # username -> (failed attempts, window start)

@app.post("/auth/login")
def login(f: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    key, now = f.username.strip().lower(), time.time()
    n, first = FAILS.get(key, (0, now))
    if now - first > 900: n, first = 0, now
    if n >= 5: raise HTTPException(429, "Too many failed attempts. Try again in 15 minutes.")
    u = db.scalar(select(User).where(User.username == key))
    if not u or not verify_pw(f.password, u.pw):
        FAILS[key] = (n + 1, first); raise HTTPException(401, "Wrong ID or password")
    FAILS.pop(key, None)
    return {"access_token": make_token(u.username, u.role), "token_type": "bearer", "role": u.role, "name": u.name,
            "student_id": u.student_id, "must_change": bool(u.must_change)}

class ChangePw(BaseModel):
    old_password: str; new_password: str

@app.post("/auth/change-password")
def change_password(b: ChangePw, db: Session = Depends(get_db), u: User = Depends(current_any)):
    if not verify_pw(b.old_password, u.pw): raise HTTPException(400, "Current password is incorrect")
    if len(b.new_password) < 8: raise HTTPException(400, "New password must be at least 8 characters")
    if b.new_password == b.old_password: raise HTTPException(400, "New password must be different from the current one")
    u.pw, u.must_change, u.initial_pw = hash_pw(b.new_password), False, None
    db.commit(); return {"ok": True}

class Forgot(BaseModel):
    username: str

@app.post("/auth/forgot")
def forgot(b: Forgot, db: Session = Depends(get_db)):
    key = b.username.strip().lower()
    u = db.scalar(select(User).where(User.username == key))
    if u and u.role in ("faculty", "student") and not db.scalar(select(ResetRequest).where(ResetRequest.username == key, ResetRequest.status == "pending")):
        db.add(ResetRequest(username=key, role=u.role)); db.commit()
    # Same answer whether or not the id exists, so ids cannot be probed.
    return {"message": "If this ID exists, a request has been sent to the administrator. After verifying your identity, the administrator will give you a temporary password."}

class NewUser(BaseModel):
    username: str; name: str; password: str; role: str

@app.post("/admin/users")
def create_user(b: NewUser, db: Session = Depends(get_db), u: User = Depends(roles("admin"))):
    if b.role not in ("mentor", "admin"): raise HTTPException(400, "Faculty and students are created from their panels. Use role mentor or admin here.")
    key = b.username.strip().lower()
    if not key or len(b.password) < 8: raise HTTPException(400, "Username is required and the password needs at least 8 characters")
    if db.scalar(select(User).where(User.username == key)): raise HTTPException(409, "This username already exists")
    db.add(User(username=key, name=b.name, pw=hash_pw(b.password), role=b.role)); db.commit(); return {"ok": True}

# ---------- stages 1-3: ingestion ----------
@app.post("/ingest/upload")
async def upload(file: UploadFile = File(...), db: Session = Depends(get_db), u: User = Depends(roles("admin"))):
    try: rep = ing.ingest(db, await file.read(), file.filename or "upload.csv")
    except ValueError as e: raise HTTPException(400, str(e))
    db.add(Audit(user_email=u.username, action=f"upload:{file.filename}")); db.commit()
    return rep

# ---------- stage 8: role dashboards ----------
@app.get("/students")
def students(db: Session = Depends(get_db), u: User = Depends(roles("student", "faculty", "mentor"))):
    sts = [s for s in db.scalars(select(Student)).all() if allowed(u, s)] if u.role != "student" else \
          [s for s in db.scalars(select(Student).where(Student.student_id == u.student_id)).all() if allowed(u, s)]
    sc = ml.score_rows(ml.frame(db)); out = []
    for s in sts:
        r = sc.get(s.id)
        out.append({"student_id": s.student_id, "name": s.name, "branch": s.branch, "class_code": s.class_code,
                    "risk": r[0] if r else None, "at_risk": bool(r and r[0] >= ml.THRESHOLD)})
    return sorted(out, key=lambda x: -(x["risk"] or 0))

def events(snaps):
    ev = []
    for i, s in enumerate(snaps):
        if i and (snaps[i - 1].attendance_pct or 0) - (s.attendance_pct or 0) >= 10: ev.append({"semester": s.semester, "type": "alert", "text": "Attendance dropped"})
        if s.intervention_flag: ev.append({"semester": s.semester, "type": "intervention", "text": "Intervention started"})
        if i and snaps[i - 1].intervention_flag and (s.internal_marks or 0) - (snaps[i - 1].internal_marks or 0) >= 10:
            ev.append({"semester": s.semester, "type": "recovery", "text": "Marks recovered"})
    return ev

@app.get("/students/{sid}")
def student_detail(sid: str, db: Session = Depends(get_db), u: User = Depends(roles("student", "faculty", "mentor"))):
    st = student_or_404(db, u, sid, "view_profile")
    snaps = db.scalars(select(Snapshot).where(Snapshot.student_pk == st.id).order_by(Snapshot.semester)).all()
    plans = db.scalars(select(Plan).where(Plan.student_pk == st.id).order_by(Plan.id.desc())).all()
    if u.role == "student": plans = [p for p in plans if p.status == "approved"]
    notes = [] if u.role == "student" else db.scalars(select(Note).where(Note.student_pk == st.id).order_by(Note.id.desc())).all()
    cols = ml.NUM + ["semester", "intervention_flag", "outcome_flag"]
    return {"student": {"student_id": st.student_id, "name": st.name, "branch": st.branch, "class_code": st.class_code, "peer_opt_in": st.peer_opt_in},
            "timeline": [{c: getattr(s, c) for c in cols} for s in snaps], "events": events(snaps), "risk": ml.score_student(db, st),
            "plans": [{"id": p.id, "status": p.status, "content": p.content, "followups": p.followups, "created_by": p.created_by} for p in plans],
            "notes": [{"author": n.author, "text": n.text, "ts": str(n.ts)} for n in notes]}

class WhatIf(BaseModel):
    overrides: dict

@app.post("/students/{sid}/whatif")
def whatif(sid: str, b: WhatIf, db: Session = Depends(get_db), u: User = Depends(roles("student", "faculty", "mentor"))):
    st = student_or_404(db, u, sid, "whatif")
    try: return ml.whatif(db, st, b.overrides)
    except ValueError as e: raise HTTPException(400, str(e))

class NoteIn(BaseModel):
    text: str

@app.post("/students/{sid}/notes")
def add_note(sid: str, b: NoteIn, db: Session = Depends(get_db), u: User = Depends(roles(*STAFF))):
    st = student_or_404(db, u, sid, "add_note"); db.add(Note(student_pk=st.id, author=u.username, text=b.text)); db.commit(); return {"ok": True}

@app.get("/students/{sid}/peers")
def get_peers(sid: str, db: Session = Depends(get_db), u: User = Depends(roles("student", "faculty", "mentor"))):
    return ml.peers(db, student_or_404(db, u, sid, "peers"))

@app.post("/me/peer-opt-in")
def opt_in(on: bool, db: Session = Depends(get_db), u: User = Depends(roles("student"))):
    st = db.scalar(select(Student).where(Student.student_id == u.student_id))
    if not st: raise HTTPException(404, "No linked student record")
    st.peer_opt_in = on; db.commit(); return {"peer_opt_in": on}

# ---------- stage 7: intervention plans (human in the loop) ----------
@app.post("/students/{sid}/plan")
def make_plan(sid: str, db: Session = Depends(get_db), u: User = Depends(roles("mentor"))):
    st = student_or_404(db, u, sid, "generate_plan")
    p = Plan(student_pk=st.id, content=ml.build_plan(db, st), created_by=u.username, followups=[]); db.add(p); db.commit()
    return {"id": p.id, "status": p.status, "content": p.content}

class PlanEdit(BaseModel):
    actions: list[str]

def plan_for_mentor(db, u, pid):
    p = db.get(Plan, pid); st = db.get(Student, p.student_pk) if p else None
    if not p or not allowed(u, st): raise HTTPException(404, "Plan not found")
    return p, st

@app.patch("/plans/{pid}")
def edit_plan(pid: int, b: PlanEdit, db: Session = Depends(get_db), u: User = Depends(roles("mentor"))):
    p, _ = plan_for_mentor(db, u, pid)
    if p.status == "approved": raise HTTPException(400, "Already approved")
    p.content = {**p.content, "actions": b.actions}; db.commit(); return {"ok": True}

@app.post("/plans/{pid}/approve")
def approve(pid: int, db: Session = Depends(get_db), u: User = Depends(roles("mentor"))):
    p, st = plan_for_mentor(db, u, pid); p.status, p.approved_by = "approved", u.username
    p.followups = p.content.get("followups", []); db.add(Audit(user_email=u.username, action="approve_plan", student_id=st.student_id)); db.commit()
    return {"status": "approved"}

class Follow(BaseModel):
    day: int; status: str; note: str = ""

@app.post("/plans/{pid}/followup")
def followup(pid: int, b: Follow, db: Session = Depends(get_db), u: User = Depends(roles("mentor"))):
    p, _ = plan_for_mentor(db, u, pid)
    p.followups = [{**f, "status": b.status, "note": b.note} if f["day"] == b.day else f for f in (p.followups or [])]; db.commit()
    return {"ok": True}

# ---------- student copilot (grounded in own records only) ----------
class Ask(BaseModel):
    question: str

@app.post("/copilot")
def copilot(b: Ask, db: Session = Depends(get_db), u: User = Depends(roles("student"))):
    st = student_or_404(db, u, u.student_id or "", "copilot")
    risk = ml.score_student(db, st)
    snaps = db.scalars(select(Snapshot).where(Snapshot.student_pk == st.id).order_by(Snapshot.semester)).all()
    plans = [p.content.get("actions", []) for p in db.scalars(select(Plan).where(Plan.student_pk == st.id, Plan.status == "approved")).all()]
    ctx = {"name": st.name, "history": [{c: getattr(s, c) for c in ml.NUM + ["semester"]} for s in snaps],
           "risk": risk["risk"], "top_reasons": [r["label"] for r in risk["reasons"]], "approved_plan_actions": plans}
    key = os.getenv("ANTHROPIC_API_KEY")
    if key:
        try:
            import anthropic
            r = anthropic.Anthropic(api_key=key).messages.create(
                model=os.getenv("COPILOT_MODEL", "claude-sonnet-5-5"), max_tokens=600,
                system="You are a study coach. Answer ONLY from the student's own records provided. If the records do not answer it, say so. Be encouraging and concrete. Predictions are estimates, not guarantees.",
                messages=[{"role": "user", "content": f"My records:\n{json.dumps(ctx)}\n\nQuestion: {b.question}"}])
            return {"answer": r.content[0].text, "source": "llm"}
        except Exception:
            pass
    reasons = ", ".join(ctx["top_reasons"]) or "no major risk factors found"
    acts = " ".join(a for p in plans for a in p) or "No approved plan yet - ask your mentor."
    return {"answer": f"Based on your records, your current focus areas are: {reasons}. {acts}", "source": "rules"}

# ---------- stage 6 / 8: admin analytics (anonymised), model, insights ----------
@app.get("/admin/analytics")
def analytics(db: Session = Depends(get_db), u: User = Depends(roles("admin"))):
    df = ml.frame(db)
    if df.empty: return {"students": 0, "branches": [], "clusters": [], "model": None}
    sc = ml.score_rows(df); L = ml.latest(df).copy(); L["risk"] = L.student_pk.map(lambda k: sc[int(k)][0])
    br = []
    for b, g in L.groupby("branch"):
        br.append({"branch": b, "suppressed": True} if len(g) < 5 else
                   {"branch": b, "n": int(len(g)), "avg_attendance": round(float(g.attendance_pct.mean()), 1),
                    "avg_marks": round(float(g.internal_marks.mean()), 1), "pct_at_risk": round(float((g.risk >= ml.THRESHOLD).mean() * 100), 1)})
    m = ml.load()
    return {"students": int(len(L)), "pct_at_risk": round(float((L.risk >= ml.THRESHOLD).mean() * 100), 1), "branches": br,
            "clusters": ml.clusters(df), "model": m["metrics"] if m else None}

@app.post("/admin/train")
def train(db: Session = Depends(get_db), u: User = Depends(roles("admin"))):
    try: return ml.train(db)
    except ValueError as e: raise HTTPException(400, str(e))

@app.post("/insights/generate")
def gen_insights(db: Session = Depends(get_db), u: User = Depends(roles("admin"))):
    for i in db.scalars(select(Insight).where(Insight.approved == False)).all(): db.delete(i)  # noqa: E712
    cards = ml.make_insights(ml.frame(db))
    for c in cards: db.add(Insight(**c))
    db.commit(); return {"generated": len(cards)}

@app.get("/insights")
def insights(db: Session = Depends(get_db), u: User = Depends(roles("faculty", "mentor", "admin"))):
    q = select(Insight) if u.role == "admin" else select(Insight).where(Insight.approved == True)  # noqa: E712
    return [{"id": i.id, "title": i.title, "body": i.body, "n": i.n, "approved": i.approved} for i in db.scalars(q.order_by(Insight.id)).all()]

@app.post("/insights/{iid}/approve")
def approve_insight(iid: int, db: Session = Depends(get_db), u: User = Depends(roles("admin"))):
    i = db.get(Insight, iid)
    if not i: raise HTTPException(404, "Not found")
    i.approved = True; db.commit(); return {"ok": True}

class ProfileAnalysisRequest(BaseModel):
    github: str
    leetcode: str

@app.post("/analyze-profiles")
def analyze_profiles(req: ProfileAnalysisRequest, db: Session = Depends(get_db), u: User = Depends(current_any)):
    import requests
    import datetime

    def calc_gh(username: str):
        if not username: return 0.0
        try:
            h = {}
            ur = requests.get(f"https://api.github.com/users/{username}", headers=h, timeout=5)
            if ur.status_code != 200: return 0.0
            ud = ur.json()
            rr = requests.get(f"https://api.github.com/users/{username}/repos?per_page=100", headers=h, timeout=5)
            rd = rr.json() if rr.status_code == 200 else []
            
            p_score = sum([bool(ud.get("bio")), ud.get("public_repos", 0) >= 4, bool(ud.get("blog") or ud.get("twitter_username")),
                           bool(ud.get("avatar_url")), any(r.get("name", "").lower() == username.lower() for r in rd)])
            p_score = min(p_score, 5)

            stars = sum(r.get("stargazers_count", 0) for r in rd)
            comm_score = min((stars + ud.get("followers", 0)) / 25, 1) * 5

            forks = sum(r.get("forks_count", 0) for r in rd)
            prs = 0
            sr = requests.get(f"https://api.github.com/search/issues?q=author:{username}+type:pr", headers=h, timeout=5)
            if sr.status_code == 200: prs = sr.json().get("total_count", 0)
            collab_score = min((prs + forks) / 10, 1) * 5

            langs = set(r.get("language") for r in rd if r.get("language"))
            orig = [r for r in rd if not r.get("fork")]
            deep = sum(1 for r in orig if r.get("size", 0) > 50)
            depth_score = min(deep / 4, 1) * 5 + min(len(langs) / 4, 1) * 5

            active_weeks = 0
            er = requests.get(f"https://api.github.com/users/{username}/events/public", headers=h, timeout=5)
            if er.status_code == 200:
                weeks = {datetime.datetime.fromisoformat(e["created_at"].replace("Z", "+00:00")).isocalendar()[1] for e in er.json() if "created_at" in e}
                active_weeks = min(len(weeks) * 4, 52)
            cons_score = min(active_weeks / 30, 1) * 10

            qual = sum(1 for r in orig if r.get("description") and r.get("homepage"))
            qual_score = min(qual / 5, 1) * 15

            return p_score + comm_score + collab_score + depth_score + cons_score + qual_score
        except Exception as e:
            print(f"GitHub err: {e}")
            return 0.0

    def calc_lc(username: str):
        if not username: return 0.0
        q = '''query getUserProfile($username: String!) {
          matchedUser(username: $username) {
            profile { websites }
            badges { id }
            submitStats { acSubmissionNum { difficulty count } }
            userCalendar { totalActiveDays }
          }
          userContestRanking(username: $username) { rating }
        }'''
        try:
            r = requests.post('https://leetcode.com/graphql', json={'query': q, 'variables': {'username': username}}, timeout=5)
            if r.status_code != 200: return 0.0
            d = r.json().get("data", {})
            m = d.get("matchedUser")
            if not m: return 0.0

            webs = m.get("profile", {}).get("websites", [])
            prof_score = 5 if any("github" in w.lower() or "linkedin" in w.lower() for w in webs) else 0

            badge_score = min(len(m.get("badges", [])) / 3, 1) * 5
            cons_score = min(m.get("userCalendar", {}).get("totalActiveDays", 0) / 150, 1) * 10

            stats = m.get("submitStats", {}).get("acSubmissionNum", [])
            med = sum(s.get("count", 0) for s in stats if s.get("difficulty") == "Medium")
            hard = sum(s.get("count", 0) for s in stats if s.get("difficulty") == "Hard")
            tot = sum(s.get("count", 0) for s in stats if s.get("difficulty") == "All")
            
            qual_score = min((med * 2 + hard * 4) / 100, 1) * 15
            vol_score = min(tot / 150, 1) * 10

            rk = d.get("userContestRanking")
            rank_score = min((rk.get("rating", 0) if rk else 0) / 1600, 1) * 5

            return prof_score + badge_score + cons_score + qual_score + vol_score + rank_score
        except Exception as e:
            print(f"LeetCode err: {e}")
            return 0.0

    gh_score = calc_gh(req.github)
    lc_score = calc_lc(req.leetcode)
    score = int(gh_score + lc_score)

    improvements = []
    if not req.github and not req.leetcode:
        improvements.append("Please link your GitHub and LeetCode profiles to get a comprehensive analysis.")
    else:
        if req.github:
            improvements.append(f"GitHub: Scored {int(gh_score)}/50. Enhance your project quality with descriptions/demos, and keep pushing commits.")
        if req.leetcode:
            improvements.append(f"LeetCode: Scored {int(lc_score)}/50. Focus on solving more Medium/Hard problems and participating in contests to boost your rating.")

    improvement_text = " ".join(improvements) if improvements else "Keep practicing to improve your skills."
    
    questions = [
        "Two Sum (Array / Hash Table)",
        "Reverse Linked List (Linked List)",
        "Merge Intervals (Sorting / Array)",
        "Number of Islands (Graph / BFS / DFS)",
        "Longest Common Subsequence (Dynamic Programming)"
    ]
    import random
    suggested_questions = random.sample(questions, 3)
    
    return {
        "score": score,
        "improvement": improvement_text,
        "questions": suggested_questions
    }

@app.get("/health")
def health(): return {"ok": True}
