"""Run: python tests/test_panels.py   (uses a throwaway SQLite database)"""
import io, os, sys, tempfile
d = tempfile.mkdtemp(); os.environ.update(DATABASE_URL=f"sqlite:///{d}/t.db", MODEL_DIR=f"{d}/m", ADMIN_EMAIL="admin@t.edu", ADMIN_PASSWORD="adminpass1")
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
import pandas as pd
from fastapi.testclient import TestClient
from app.main import app

def xlsx(rows, cols):
    b = io.BytesIO(); pd.DataFrame(rows, columns=cols).to_excel(b, index=False); b.seek(0); return b.getvalue()
def up(c, H, path, mode, raw, name="f.xlsx"): return c.post(f"{path}?mode={mode}", headers=H, files={"file": (name, raw)})
def login(c, u, p): return c.post("/auth/login", data={"username": u, "password": p})
def ok(cond, msg): print(("PASS " if cond else "FAIL ") + msg); assert cond, msg

with TestClient(app) as c:
    H = {"Authorization": "Bearer " + login(c, "admin@t.edu", "adminpass1").json()["access_token"]}
    fac = xlsx([[1, "E101", "CE", "Dr A", "DSE"], [2, 1002, "CE", "Dr B", "DBMS, OS"], [3, "E201", "IT", "Dr C", "CN"], [4, "E101", "CE", "Dr A", "ML"]],
               ["Sr.No", "empID", "Department", "Faculty-Name", "Subject Teaching"])
    r = up(c, H, "/admin/faculty/upload", "replace", fac).json(); ok(r["added"] == 3 and r["error_count"] == 0, f"faculty upload {r}")
    fl = c.get("/admin/faculty", headers=H).json(); ok(fl[0]["subject"] == "DSE, ML" and fl[1]["emp_id"] == "1002", "same empID merged, numeric empID kept as text")
    r = up(c, H, "/admin/faculty/upload", "add", fac).json(); ok(r["added"] == 0 and r["skipped_duplicates"] == 3, "add mode skips duplicates")
    r = c.post("/admin/faculty/generate-passwords", headers=H).json(); ok(r["generated"] == 3, "generate 3 faculty passwords")
    r2 = c.post("/admin/faculty/generate-passwords", headers=H).json(); ok(r2["generated"] == 0, "second click generates nothing")
    fl = c.get("/admin/faculty", headers=H).json(); pw = {f["emp_id"]: f["password"] for f in fl}; ok(all(len(p) == 8 for p in pw.values()), "8 character passwords shown")
    c.post("/admin/faculty", headers=H, json={"emp_id": "E300", "department": "ME", "name": "Dr D", "subject": "TD"})
    r = c.post("/admin/faculty/generate-passwords", headers=H).json(); ok(r["generated"] == 1, "only the new row gets a password")
    ok(c.post("/admin/faculty", headers=H, json={"emp_id": "e300", "department": "ME", "name": "x"}).status_code == 409, "duplicate empID rejected (case-insensitive)")
    # classes
    cls = xlsx([["CE", 5, "A"], ["CE", "Sem 5", "B"], ["IT", 5, "A"], ["CE", 5, "A"], ["CE", "x", "C"]], ["Department", "Semester", "Class"])
    r = up(c, H, "/admin/classes/upload", "replace", cls).json(); ok(r["added"] == 3 and r["error_count"] == 1, f"class upload {r}")
    cl = c.get("/admin/classes", headers=H).json(); ids = {x["label"]: x["id"] for x in cl}
    E101 = [f for f in fl if f["emp_id"] == "E101"][0]["id"]
    ok(c.put(f"/admin/faculty/{E101}/classes", headers=H, json={"class_ids": [ids["CE / A"], ids["CE / B"]]}).status_code == 200, "faculty gets two classes")
    ok(c.put(f"/admin/faculty/{E101}/classes", headers=H, json={"class_ids": [9999]}).status_code == 400, "unknown class rejected")
    # students
    cols = ["Sr.No", "Enrollment Number", "GR Number", "Name", "Class", "Department", "Subject1", "Subject2", "Subject3"]
    stu = xlsx([[1, 2101, "G1", "S One", "A", "CE", "DSE", "DBMS", ""], [2, 2102, "G2", "S Two", "B", "CE", "ML", "", ""],
                [3, 2103, "G3", "S Three", "A", "IT", "CN", "DSE", ""], [4, 2104, "G1", "S Dup GR", "A", "CE", "DSE", "", ""]], cols)
    r = up(c, H, "/admin/students/upload", "replace", stu).json(); ok(r["added"] == 3 and r["error_count"] == 1, f"student upload, duplicate GR flagged {r}")
    sl = c.get("/admin/students", headers=H).json(); s1 = [s for s in sl if s["student_id"] == "2101"][0]
    ok(s1["subjects"][0] == {"subject": "DSE", "faculty": ["Dr A"]} and s1["subjects"][1]["faculty"] == [], "subject shows assigned faculty")
    s3 = [s for s in sl if s["student_id"] == "2103"][0]; ok(s3["subjects"][1]["faculty"] == [], "no faculty from a class that is not assigned")
    r = c.post("/admin/students/generate-passwords", headers=H).json(); ok(r["generated"] == 3, "generate student passwords")
    ok(c.post("/admin/students/generate-passwords", headers=H).json()["generated"] == 0, "students: second click generates nothing")
    stu2 = xlsx([[1, 2101, "G1", "S One Renamed", "A", "CE", "DSE", "", ""], [2, 2105, "G5", "S Five", "A", "CE", "OS", "", ""]], cols)
    r = up(c, H, "/admin/students/upload", "replace", stu2).json(); ok(r["updated"] == 1 and r["added"] == 1 and r["removed"] == 2, f"replace updates, adds, removes {r}")
    sl = c.get("/admin/students", headers=H).json(); ok(len(sl) == 2 and [s for s in sl if s["student_id"] == "2101"][0]["password"] != "", "kept student keeps existing password")
    # login / forced change / lockout
    P = {s["student_id"]: s["password"] for s in sl}
    lg = login(c, "2101", P["2101"]).json(); ok(lg["must_change"] and lg["role"] == "student", "first login requires password change")
    T = {"Authorization": "Bearer " + lg["access_token"]}
    ok(c.get("/students", headers=T).status_code == 403, "blocked until password changed")
    ok(c.post("/auth/change-password", headers=T, json={"old_password": P["2101"], "new_password": "short"}).status_code == 400, "weak new password rejected")
    ok(c.post("/auth/change-password", headers=T, json={"old_password": P["2101"], "new_password": "MyNewPass99"}).status_code == 200, "password changed")
    ok(c.get("/students", headers=T).status_code == 200, "access after change")
    ok(c.get("/admin/students", headers=H).json()[0]["password"] == "Changed by user", "admin table no longer shows the password")
    # forgot password
    m1 = c.post("/auth/forgot", json={"username": "2101"}).json(); m2 = c.post("/auth/forgot", json={"username": "nobody"}).json()
    ok(m1 == m2, "forgot gives the same answer for unknown ids")
    c.post("/auth/forgot", json={"username": "2101"})
    rq = c.get("/admin/reset-requests", headers=H).json(); ok(len(rq) == 1 and rq[0]["status"] == "pending", "one pending request, no spam duplicates")
    npw = c.post(f"/admin/reset-requests/{rq[0]['id']}/approve", headers=H).json()["password"]
    ok(login(c, "2101", "MyNewPass99").status_code == 401 and login(c, "2101", npw).json()["must_change"], "temporary password works and forces a change")
    ok(c.post("/admin/students/generate-passwords", headers=H).json()["generated"] == 1, "late-added student gets a password on the next click")
    P5 = [s for s in c.get("/admin/students", headers=H).json() if s["student_id"] == "2105"][0]["password"]
    for _ in range(5): login(c, "2105", "wrongwrong")
    ok(login(c, "2105", P5).status_code == 429, "lockout after 5 failures, even with the right password")
    # faculty sees only assigned classes
    F = login(c, "E101", pw["E101"]).json(); FH = {"Authorization": "Bearer " + F["access_token"]}
    c.post("/auth/change-password", headers=FH, json={"old_password": pw["E101"], "new_password": "FacPass1234"})
    c.post("/admin/students", headers=H, json={"student_id": "2201", "name": "Late", "department": "CE", "class_code": "B", "subjects": ["ML"]})
    c.post("/admin/students", headers=H, json={"student_id": "2202", "name": "Other", "department": "CE", "class_code": "C", "subjects": []})
    seen = {s["student_id"] for s in c.get("/students", headers=FH).json()}; ok(seen == {"2101", "2105", "2201"}, f"faculty sees only students in assigned classes {seen}")
    ok(c.get("/students/2202", headers=FH).status_code == 404, "faculty cannot open a student outside assigned classes")
    ok(c.get("/students", headers=H).status_code == 403, "admin cannot read individual academic records")
    sid = [s for s in c.get("/admin/students", headers=H).json() if s["student_id"] == "2201"][0]["id"]
    ok(c.delete(f"/admin/students/{sid}", headers=H).status_code == 200, "delete student")
    cid = ids["CE / B"]; ok(c.delete(f"/admin/classes/{cid}", headers=H).status_code == 200 and len(c.get("/admin/faculty", headers=H).json()[0]["classes"]) == 1, "deleting a class removes its assignments")
    ok(up(c, H, "/admin/faculty/upload", "add", xlsx([[1, "x"]], ["Sr.No", "Other"])).status_code == 400, "wrong columns rejected with a clear message")
print("ALL PASSED")
