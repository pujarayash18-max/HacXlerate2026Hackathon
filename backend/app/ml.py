"""Stage 5-7: unified frame, risk model, explanations, what-if, clustering, insights, plans, peers."""
import os, joblib
from datetime import date, timedelta
import numpy as np
import pandas as pd
from sklearn.cluster import KMeans
from sklearn.ensemble import GradientBoostingClassifier
from sklearn.metrics import roc_auc_score, precision_score, recall_score, brier_score_loss
from sklearn.model_selection import GroupShuffleSplit
from sklearn.preprocessing import StandardScaler
from sqlalchemy import select
from .models import Snapshot, Student

MODEL_DIR = os.getenv("MODEL_DIR", "data/models")
os.makedirs(MODEL_DIR, exist_ok=True)
PATH = f"{MODEL_DIR}/risk.joblib"
NUM = ["attendance_pct", "internal_marks", "quiz_avg", "assignment_completion_pct", "lms_logins_per_week", "prior_cgpa"]
FEATURES = NUM + ["marks_trend", "mentor_assigned"]
LABELS = {"attendance_pct": "Low attendance", "internal_marks": "Low internal marks", "quiz_avg": "Low quiz average",
          "assignment_completion_pct": "Pending assignments", "lms_logins_per_week": "Low LMS activity",
          "prior_cgpa": "Low prior CGPA", "marks_trend": "Declining marks trend", "mentor_assigned": "No mentor assigned"}
BOUNDS = {"attendance_pct": (0, 100), "internal_marks": (0, 100), "quiz_avg": (0, 100), "assignment_completion_pct": (0, 100),
          "lms_logins_per_week": (0, 50), "prior_cgpa": (0, 10), "mentor_assigned": (0, 1)}
THRESHOLD = 0.4
_cache = {}

def frame(db) -> pd.DataFrame:
    rows = db.execute(select(Snapshot, Student).join(Student, Student.id == Snapshot.student_pk)).all()
    if not rows:
        return pd.DataFrame()
    cols = NUM + ["semester", "outcome_flag", "intervention_flag"]
    df = pd.DataFrame([{**{c: getattr(s, c) for c in cols}, "student_pk": st.id, "branch": st.branch,
                        "mentor_assigned": int(bool(st.mentor_email))} for s, st in rows])
    df = df.sort_values(["student_pk", "semester"]).reset_index(drop=True)
    df["marks_trend"] = df.groupby("student_pk")["internal_marks"].diff().fillna(0)
    return df

def latest(df): return df.groupby("student_pk").tail(1)

def load():
    if "m" not in _cache and os.path.exists(PATH):
        _cache["m"] = joblib.load(PATH)
    return _cache.get("m")

def rule(x) -> float:
    """Cold-start fallback: simple transparent rules."""
    v = (.45 * (1 - x["attendance_pct"] / 100) + .25 * (1 - x["internal_marks"] / 100)
         + .15 * (1 - x["assignment_completion_pct"] / 100) + .15 * (1 - min(x["lms_logins_per_week"], 10) / 10))
    return float(np.clip(v * 1.6, 0, 1))

def rule_reasons(x):
    chk = [("attendance_pct", x["attendance_pct"] < 75), ("internal_marks", x["internal_marks"] < 50),
           ("assignment_completion_pct", x["assignment_completion_pct"] < 60), ("lms_logins_per_week", x["lms_logins_per_week"] < 2)]
    return [{"feature": f, "label": LABELS[f], "value": float(x[f]), "impact": None} for f, bad in chk if bad]

def explain(m, X):
    try:
        import shap
        sv = np.array(shap.TreeExplainer(m["model"]).shap_values(X)).reshape(-1)[:len(FEATURES)]
    except Exception:  # fallback: substitute population median, measure drop in risk
        base = m["model"].predict_proba(X)[0, 1]; sv = []
        for f in FEATURES:
            X2 = X.copy(); X2[f] = m["median"][f]
            sv.append(base - m["model"].predict_proba(X2)[0, 1])
        sv = np.array(sv)
    return [{"feature": FEATURES[i], "label": LABELS[FEATURES[i]], "value": float(X.iloc[0, i]), "impact": float(sv[i])}
            for i in np.argsort(-sv)[:3] if sv[i] > 0]

def train(db) -> dict:
    df = frame(db)
    d = df[df.outcome_flag.notna()].copy() if not df.empty else df
    if df.empty or len(d) < 60 or d.outcome_flag.value_counts().min() < 10 or d.outcome_flag.nunique() < 2:
        raise ValueError("Need at least 60 labelled rows (outcome_flag) with 10+ of each class to train.")
    med = d[FEATURES].median()
    X, y = d[FEATURES].fillna(med), d.outcome_flag.astype(int)
    tr, te = next(GroupShuffleSplit(n_splits=1, test_size=.25, random_state=42).split(X, y, groups=d.student_pk))
    model = GradientBoostingClassifier(random_state=42).fit(X.iloc[tr], y.iloc[tr])
    p = model.predict_proba(X.iloc[te])[:, 1]; pred = (p >= THRESHOLD).astype(int); yt = y.iloc[te].values
    metrics = {"auc": float(roc_auc_score(yt, p)) if len(set(yt)) > 1 else None, "precision": float(precision_score(yt, pred, zero_division=0)),
               "recall": float(recall_score(yt, pred, zero_division=0)), "brier": float(brier_score_loss(yt, p)),
               "n_train": int(len(tr)), "n_test": int(len(te)), "threshold": THRESHOLD}
    fair, br = [], d.branch.iloc[te].values
    for b in sorted(set(br)):
        k = br == b
        if k.sum() >= 10:
            fair.append({"branch": b, "n": int(k.sum()), "recall": float(recall_score(yt[k], pred[k], zero_division=0)),
                         "precision": float(precision_score(yt[k], pred[k], zero_division=0))})
    gap = (max(f["recall"] for f in fair) - min(f["recall"] for f in fair)) if len(fair) > 1 else 0
    metrics["fairness"] = {"by_branch": fair, "recall_gap": float(gap), "flag": bool(gap > .15)}
    joblib.dump({"model": model, "median": med, "metrics": metrics}, PATH); _cache.clear()
    return metrics

def _predict(x, cold, m):
    return rule(x) if cold else float(m["model"].predict_proba(pd.DataFrame([x[FEATURES]]))[0, 1])

def score_rows(df) -> dict:
    out, m = {}, load()
    if df.empty: return out
    fill = m["median"] if m else pd.Series(50.0, index=FEATURES)
    cnt = df.groupby("student_pk").size(); L = latest(df).copy()
    L[FEATURES] = L[FEATURES].astype(float).fillna(fill)
    for _, r in L.iterrows():
        pk = int(r.student_pk); cold = m is None or cnt[pk] < 2
        out[pk] = (_predict(r, cold, m), cold)
    return out

def score_student(db, st) -> dict:
    df = frame(db); sub = df[df.student_pk == st.id] if not df.empty else df
    if sub.empty: return {"risk": None, "method": "no-data", "reasons": [], "features": {}}
    m = load(); fill = m["median"] if m else pd.Series(50.0, index=FEATURES)
    x = sub.iloc[-1][FEATURES].astype(float).fillna(fill); cold = m is None or len(sub) < 2
    X = pd.DataFrame([x])
    return {"risk": _predict(x, cold, m), "method": "rules (cold start)" if cold else "model",
            "reasons": rule_reasons(x) if cold else explain(m, X), "features": {k: float(v) for k, v in x.items()}}

def whatif(db, st, overrides: dict) -> dict:
    base = score_student(db, st)
    if base["risk"] is None: raise ValueError("No data for this student")
    m = load(); n = len(frame(db).query("student_pk == @st.id")); cold = m is None or n < 2
    x = pd.Series(base["features"]); applied = {}
    for k, v in overrides.items():
        if k in BOUNDS:
            lo, hi = BOUNDS[k]; x[k] = float(np.clip(v, lo, hi)); applied[k] = x[k]
    after = _predict(x, cold, m)
    return {"before": base["risk"], "after": after, "delta": after - base["risk"], "applied": applied, "method": base["method"],
            "disclaimer": "Estimated change learned from past correlations; not a guaranteed outcome."}

ACTIONS = {"attendance_pct": "Attendance plan: raise attendance by about 10 points; mentor checks weekly.",
           "assignment_completion_pct": "Complete pending assignments; agree a dated submission schedule.",
           "mentor_assigned": "Assign a mentor and hold a first meeting this week.",
           "lms_logins_per_week": "Use the learning platform at least twice more per week; follow suggested resources."}

def build_plan(db, st) -> dict:
    s = score_student(db, st); f = s["features"]; ov = {}
    if f["attendance_pct"] < 85: ov["attendance_pct"] = min(100, f["attendance_pct"] + 10)
    if f["assignment_completion_pct"] < 90: ov["assignment_completion_pct"] = min(100, f["assignment_completion_pct"] + 20)
    if not f["mentor_assigned"]: ov["mentor_assigned"] = 1
    if f["lms_logins_per_week"] < 3: ov["lms_logins_per_week"] = f["lms_logins_per_week"] + 2
    sim = whatif(db, st, ov)
    today = date.today()
    return {"risk_reasons": [r["label"] for r in s["reasons"]], "actions": [ACTIONS[k] for k in ov],
            "simulation": {"before": sim["before"], "after": sim["after"], "applied": sim["applied"]},
            "followups": [{"day": d, "due": str(today + timedelta(days=d)), "status": "pending", "note": ""} for d in (7, 14, 30)],
            "note": "Draft generated from risk reasons and the best simulation. Requires mentor approval before the student sees it."}

def clusters(df) -> list:
    if df.empty or df.student_pk.nunique() < 9: return []
    L = latest(df); X = L[NUM].astype(float); X = X.fillna(X.median()).fillna(0)
    km = KMeans(3, n_init=10, random_state=42).fit(StandardScaler().fit_transform(X)); L = L.assign(c=km.labels_)
    g = L.groupby("c").agg(n=("student_pk", "size"), att=("attendance_pct", "mean"), marks=("internal_marks", "mean"))
    order = (g.att + g.marks).sort_values(ascending=False).index.tolist(); names = ["High achievers", "Steady", "Needs support"]
    return [{"segment": names[i], "n": int(g.loc[c, "n"]), "avg_attendance": round(float(g.loc[c, "att"]), 1),
             "avg_marks": round(float(g.loc[c, "marks"]), 1)} for i, c in enumerate(order)]

def make_insights(df) -> list:
    if df.empty: return []
    d = df[df.outcome_flag.notna()]; cards = []
    def card(title, mask, desc):
        a, b = d[mask], d[~mask]
        if len(a) >= 30 and len(b) >= 30:
            cards.append({"title": title, "n": int(len(d)), "body": f"{desc}: {a.outcome_flag.mean():.0%} had a poor outcome vs "
                          f"{b.outcome_flag.mean():.0%} otherwise (groups of {len(a)} and {len(b)}). Association, not proven cause."})
    if len(d):
        card("Low attendance", d.attendance_pct < 75, "Students below 75% attendance")
        card("Declining marks", d.marks_trend < 0, "Students whose internal marks fell versus last semester")
        card("Low LMS activity", d.lms_logins_per_week < d.lms_logins_per_week.median(), "Students with below-median LMS logins")
        card("Pending assignments", d.assignment_completion_pct < 60, "Students with under 60% assignment completion")
    return cards

def peers(db, st, k=3) -> list:
    df = frame(db)
    if df.empty: return []
    L = latest(df).set_index("student_pk"); dims = ["attendance_pct", "internal_marks", "quiz_avg", "assignment_completion_pct"]
    if st.id not in L.index: return []
    me = L.loc[st.id, dims].astype(float).fillna(50); weak = me[me < 65].index.tolist()
    if not weak: return []
    cands = db.scalars(select(Student).where(Student.peer_opt_in == True, Student.branch == st.branch, Student.id != st.id)).all()  # noqa: E712
    out = []
    for c in cands:
        if c.id in L.index:
            p = L.loc[c.id, dims].astype(float).fillna(50)
            score = float(sum(max(p[w] - me[w], 0) for w in weak))
            if score > 0: out.append({"name": c.name, "student_id": c.student_id, "strong_in": [w for w in weak if p[w] > me[w] + 10], "score": round(score, 1)})
    return sorted(out, key=lambda r: -r["score"])[:k]
