"""OPTIONAL: writes a SYNTHETIC CSV for demos/tests. The app itself ships with no data.
Usage: python scripts/make_synthetic_csv.py out.csv [n_students]"""
import sys, numpy as np, pandas as pd
out = sys.argv[1] if len(sys.argv) > 1 else "SYNTHETIC_students.csv"
n = int(sys.argv[2]) if len(sys.argv) > 2 else 300
rng = np.random.default_rng(7); rows = []
for i in range(n):
    branch = rng.choice(["CE", "IT", "ME", "EC"]); ability = rng.normal(0, 1); cls = f"{branch}-{rng.integers(1, 4)}"
    att = np.clip(75 + 8 * ability + rng.normal(0, 8), 30, 100)
    for sem in range(1, 5):
        att = np.clip(att + rng.normal(-2, 6), 20, 100); marks = np.clip(60 + 10 * ability + 0.2 * (att - 75) + rng.normal(0, 8), 5, 100)
        asg = np.clip(70 + 10 * ability + rng.normal(0, 12), 0, 100); lms = np.clip(5 + 2 * ability + rng.normal(0, 2), 0, 30)
        z = -0.06 * (att - 70) - 0.05 * (marks - 55) - 0.02 * (asg - 60) - 0.1 * (lms - 4) - 0.5 + rng.normal(0, .5)
        rows.append(dict(student_id=f"SYN{i:04d}", name=f"Synthetic Student {i:04d}", branch=branch, semester=sem, class_code=cls,
                         mentor_email=(f"mentor{i % 8}@example.edu" if i % 3 else ""), attendance_pct=round(att, 1), internal_marks=round(marks, 1),
                         quiz_avg=round(np.clip(marks + rng.normal(0, 6), 0, 100), 1), assignment_completion_pct=round(asg, 1),
                         lms_logins_per_week=round(lms, 1), prior_cgpa=round(np.clip(6.5 + ability, 3, 10), 2),
                         intervention_flag=int(sem > 1 and att < 65 and rng.random() < .5), outcome_flag=int(1 / (1 + np.exp(-z)) > rng.random())))
pd.DataFrame(rows).to_csv(out, index=False); print(f"wrote {out} (SYNTHETIC data, {len(rows)} rows)")
