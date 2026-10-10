# AI-Powered Student Analytics and Success Platform

KPMG in India, Challenge 04. Built to the workflow and tech stack in the project PDF, plus three admin panels for faculty, class assignment and students.

## Run it

Docker:
```bash
cp .env.example .env        # set ADMIN_EMAIL, ADMIN_PASSWORD, JWT_SECRET
docker compose up --build   # web http://localhost:3000, API docs http://localhost:8000/docs
```
Without Docker (SQLite, no Redis), in two terminals:
```bash
cd backend && python -m venv .venv && .venv/Scripts/activate   # macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
# set ADMIN_EMAIL, ADMIN_PASSWORD, JWT_SECRET as environment variables, then:
uvicorn app.main:app --reload --port 8000

cd frontend && npm install && npm run dev
```
Upgrading from the earlier zip: the database layout changed. Delete `backend/data/app.db` (no Docker) or run `docker compose down -v` (Docker) before starting.

## Admin panels

Sheet templates with the right headers are in `templates/`. Files can be .xlsx or .csv. Headers are matched ignoring case, spaces and punctuation.

| Panel | Sheet columns | What it does |
|---|---|---|
| Faculty | Sr.No, empID, Department, Faculty-Name, Subject Teaching | Table with CRUD and a filter on every column. empID is the login ID. Several subjects go in one cell, separated by commas. |
| Class assignment | Department, Semester, Class | Class list with CRUD, then a faculty table. Select classes opens a list grouped by semester; one faculty member can take many classes. |
| Students | Sr.No, Enrollment Number, GR Number, Name, Class, Department, Subject1 ... SubjectN | Table with CRUD and filters. Enrollment Number is the login ID. Under each subject the faculty assigned to that subject for the student's class is shown (needs the Faculty and Class assignment panels filled in). |

Upload buttons on every panel:
- **Update whole data**: rows in the sheet update matching records and add new ones; records not in the sheet are deleted together with their accounts, plans and notes. Matching records keep their password and academic history. A confirmation is shown first.
- **Add to existing data**: only adds. Rows whose ID already exists are skipped and counted, never overwritten. Duplicate GR Numbers are rejected.

Passwords:
- **Generate passwords** creates an 8-character password (letters and digits, no look-alike characters) only for rows that do not have an account yet. Clicking again never changes existing passwords, so repeated clicks only fill the rows still waiting.
- The password column is empty until generated, then shows the temporary password. Users must choose their own at first sign-in; after that the column shows "Changed by user" and the temporary password is erased.
- Forgot password: the user sends a request from the sign-in page (same reply whether or not the ID exists). The admin sees it under Password requests, verifies the person, and approves; a new temporary password is shown once and the user must change it at next sign-in. Admins can also reset by ID. Five wrong passwords lock an ID for 15 minutes.
- Admin accounts have no self-service reset. Set a new `ADMIN_PASSWORD` and create a new admin, or reset the database row.

Access: faculty see students whose Department and Class match a class assigned to them. Mentors see students whose `mentor_email` equals the mentor's username. Admins never open individual academic records.

## First-use flow

1. Sign in as the admin from `.env`. The app ships empty, with no mock data.
2. Faculty panel: upload faculty, Generate passwords.
3. Class assignment panel: upload classes, assign classes to each faculty member.
4. Students panel: upload students, Generate passwords.
5. Analytics and accounts: upload the academic CSV (use the enrollment number as `student_id`), train the model, generate and approve insights. Create mentor accounts there.
6. Give each person their ID and temporary password. `SYNTHETIC_sample_students.csv` is for demos only and must be labelled synthetic wherever it is shown.

## Tests

```bash
cd backend && python tests/test_panels.py    # 36 checks: uploads, modes, passwords, resets, access rules
```

## Before you launch (checklist)

- [ ] Custom domain: point DNS at your host, serve the web app and API over HTTPS, set `NEXT_PUBLIC_API_URL` to the API address and `CORS_ORIGINS` to the web address, then rebuild the web image.
- [ ] Set `NEXT_PUBLIC_ORG_NAME` and `NEXT_PUBLIC_CONTACT_EMAIL` so the Privacy policy and Terms pages name your institution and contact. Have your legal team review both pages and confirm DPDP Act consent flows.
- [ ] Change `JWT_SECRET` and the admin password.
- [ ] Favicon is `frontend/app/icon.svg`. Replace it with your institution's mark if you have one.

## Notes and limits

- The temporary password is stored in readable form (so the admin can hand it out) until the user changes it. It is deleted at that moment. Real passwords are stored only as salted PBKDF2 hashes.
- Generating passwords hashes each one with PBKDF2; for around 1000 accounts allow up to a minute.
- Simulator output is an estimate from correlations, not proof of cause.
- Retraining needs `outcome_flag` labels (1 = failed or dropped out): at least 60 labelled rows, 10 or more per class.
- Not built yet (Pilot phase in the PDF): Moodle, Google Classroom and ERP connectors (`worker.sync_sources` is the hook), pgvector, MinIO, MLflow, Sentry and Prometheus, SSO. Fairness check is per-branch recall and precision.
