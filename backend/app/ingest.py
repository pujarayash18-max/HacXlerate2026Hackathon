"""Stage 2-3: ingestion, schema checks, cleaning, identity matching."""
import io
import numpy as np
import pandas as pd
from rapidfuzz import process, fuzz
from sqlalchemy import select
from .models import Student, Snapshot

NUM = ["attendance_pct", "internal_marks", "quiz_avg", "assignment_completion_pct", "lms_logins_per_week", "prior_cgpa"]
PCT = ["attendance_pct", "internal_marks", "quiz_avg", "assignment_completion_pct"]
REQ = ["name", "branch", "semester"]
TXT = ["student_id", "name", "branch", "class_code", "mentor_email"]

def _clean_txt(s):
    s = s.astype(object).where(s.notna(), None)
    return s.map(lambda v: (str(v).strip() or None) if v is not None else None)

def ingest(db, raw: bytes, filename: str) -> dict:
    df = pd.read_excel(io.BytesIO(raw)) if filename.lower().endswith((".xlsx", ".xls")) else pd.read_csv(io.BytesIO(raw))
    df.columns = [c.strip().lower() for c in df.columns]
    miss = [c for c in REQ if c not in df.columns]
    if miss:
        raise ValueError(f"Missing required columns: {miss}")
    rep = {"rows_in": int(len(df))}
    for c in TXT:
        df[c] = _clean_txt(df[c]) if c in df.columns else None
    for c in NUM + ["outcome_flag", "intervention_flag"]:
        df[c] = pd.to_numeric(df[c], errors="coerce") if c in df.columns else np.nan
    df["semester"] = pd.to_numeric(df["semester"], errors="coerce")
    for c in PCT:
        df[c] = df[c].clip(0, 100)
    df["prior_cgpa"] = df["prior_cgpa"].clip(0, 10)

    # identity matching across systems (same person, different id/spelling)
    existing = {s.student_id: s for s in db.scalars(select(Student))}
    by_name = {s.name.lower(): s for s in existing.values()}
    matched = 0
    def resolve(r):
        nonlocal matched
        sid = r["student_id"]
        if sid and sid in existing:
            return sid
        if by_name and r["name"]:
            hit = process.extractOne(str(r["name"]).lower(), list(by_name.keys()), scorer=fuzz.WRatio, score_cutoff=92)
            if hit and by_name[hit[0]].branch == r["branch"]:
                matched += 1
                return by_name[hit[0]].student_id
        return sid
    df["student_id"] = df.apply(resolve, axis=1)
    rep["identity_matched"] = matched

    before = len(df)
    df = df.dropna(subset=["student_id", "semester", "name", "branch"])
    rep["dropped_invalid"] = int(before - len(df))
    n = len(df)
    df = df.drop_duplicates(["student_id", "semester"], keep="last")
    rep["duplicates_removed"] = int(n - len(df))

    # impute only when a column is mostly present (<30% missing); per-branch median
    imputed = 0
    for c in NUM:
        if df[c].isna().mean() < 0.30 and df[c].isna().any():
            med = df.groupby("branch")[c].transform("median").fillna(df[c].median())
            imputed += int(df[c].isna().sum())
            df[c] = df[c].fillna(med)
    rep["imputed_cells"] = imputed

    new_students = 0
    for r in df.to_dict("records"):
        st = existing.get(r["student_id"])
        if not st:
            st = Student(student_id=r["student_id"])
            db.add(st); new_students += 1
            existing[st.student_id] = st
        st.name, st.branch = r["name"], r["branch"]
        if isinstance(r.get("class_code"), str): st.class_code = r["class_code"]
        if isinstance(r.get("mentor_email"), str): st.mentor_email = r["mentor_email"].lower()
        db.flush()
        snap = db.scalar(select(Snapshot).where(Snapshot.student_pk == st.id, Snapshot.semester == int(r["semester"])))
        if not snap:
            snap = Snapshot(student_pk=st.id, semester=int(r["semester"])); db.add(snap)
        for c in NUM:
            setattr(snap, c, None if pd.isna(r[c]) else float(r[c]))
        snap.intervention_flag = 0 if pd.isna(r["intervention_flag"]) else int(r["intervention_flag"])
        snap.outcome_flag = None if pd.isna(r["outcome_flag"]) else float(r["outcome_flag"])
    db.commit()
    rep.update(rows_loaded=int(len(df)), new_students=new_students)
    return rep
