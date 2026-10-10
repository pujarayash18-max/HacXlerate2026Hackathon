"use client";
import { useEffect, useMemo, useState } from "react";
import { A, call, post, put, del } from "../lib/api";
import { Col, DataTable, Field, Modal } from "./DataTable";

function UploadBox({ tok, path, columns, noun, onDone }: { tok: string; path: string; columns: string; noun: string; onDone: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [k, setK] = useState(0);
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<A>(null);
  const [err, setErr] = useState("");
  const send = async (mode: "replace" | "add") => {
    if (!file) return;
    if (mode === "replace" && !window.confirm(`Update whole data?\n\nRows in the sheet will update matching ${noun} records and add new ones. ${noun} records that are NOT in the sheet will be deleted, with their accounts, plans and notes.`)) return;
    setBusy(true); setErr(""); setRes(null);
    try {
      const fd = new FormData(); fd.append("file", file);
      setRes(await call(`${path}?mode=${mode}`, tok, { method: "POST", body: fd }));
      setFile(null); setK(k + 1); onDone();
    } catch (e: A) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <div className="card space-y-2">
      <h3 className="font-semibold">Upload Excel sheet</h3>
      <p className="muted">Columns: {columns}. File type .xlsx or .csv.</p>
      <input key={k} type="file" accept=".xlsx,.csv" onChange={e => setFile(e.target.files?.[0] || null)} aria-label={`Choose ${noun} sheet`} />
      <div className="flex flex-wrap gap-2">
        <button className="btn2" disabled={!file || busy} onClick={() => send("replace")}>Update whole data</button>
        <button className="btn" disabled={!file || busy} onClick={() => send("add")}>Add to existing data</button>
      </div>
      <p className="muted">Update whole data replaces the current list with the sheet. Add to existing data only adds rows that are not already present and skips duplicates.</p>
      {busy && <p className="muted">Uploading...</p>}
      {err && <p className="err" role="alert">{err}</p>}
      {res && (
        <div className="text-sm border-t border-stone-200 pt-2" role="status">
          <p>Added {res.added}{res.updated !== undefined ? `, updated ${res.updated}` : ""}, skipped duplicates {res.skipped_duplicates}{res.mode === "replace" ? `, removed ${res.removed}` : ""}.</p>
          {res.error_count > 0 && <><p className="err">{res.error_count} row(s) not loaded:</p><ul className="list-disc ml-5 err">{res.errors.map((e: string, i: number) => <li key={i}>{e}</li>)}</ul>{res.error_count > res.errors.length && <p className="muted">Showing the first {res.errors.length}.</p>}</>}
        </div>)}
    </div>
  );
}

function PwCell({ r }: { r: A }) {
  return r.pw_state === "initial" ? <code className="bg-stone-100 px-1.5 py-0.5 rounded select-all">{r.password}</code>
    : r.pw_state === "changed" ? <span className="text-stone-600">Changed by user</span> : <span />;
}

function GenerateBar({ tok, path, sendPath, rows, onDone }: { tok: string; path: string; sendPath: string; rows: A[]; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const waiting = rows.filter(r => r.pw_state === "none").length;
  const waitingEmail = rows.filter(r => r.pw_state === "initial").length;
  const goGenerate = async () => {
    setBusy(true); setMsg("");
    try {
      const r = await post(path, tok);
      setMsg(`${r.generated} password(s) generated.` + (r.id_conflicts.length ? ` Not created, because the ID is already used by another account: ${r.id_conflicts.join(", ")}.` : ""));
      onDone();
    } catch (e: A) { setMsg("Error: " + e.message); } finally { setBusy(false); }
  };
  const goSendEmail = async () => {
    setBusy(true); setMsg("");
    try {
      const r = await post(sendPath, tok);
      setMsg(`${r.sent} email(s) sent.`);
      onDone();
    } catch (e: A) { setMsg("Error: " + e.message); } finally { setBusy(false); }
  };
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn" disabled={busy || waiting === 0} onClick={goGenerate}>Generate passwords</button>
        <span className="muted">{waiting === 0 ? "Every row already has a password. Passwords are generated once and never overwritten." : `${waiting} row(s) waiting for a password. Rows that already have one are not touched.`}</span>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn" disabled={busy || waitingEmail === 0} onClick={goSendEmail}>Send emails</button>
        <span className="muted">{waitingEmail === 0 ? "No newly generated passwords to email." : "Send emails for newly generated passwords."}</span>
        {busy && <span className="muted">Processing...</span>}
        {msg && <span className="text-sm font-semibold" role="status">{msg}</span>}
      </div>
    </div>
  );
}

const confirmDelete = (what: string) => window.confirm(`Delete ${what}? This also removes the linked account and related records. This cannot be undone.`);

/* ---------------- Panel 1: faculty ---------------- */
export function FacultyPanel({ tok }: { tok: string }) {
  const [rows, setRows] = useState<A[]>([]);
  const [form, setForm] = useState<A | null>(null);
  const [err, setErr] = useState("");
  const load = () => call("/admin/faculty", tok).then(setRows).catch(e => setErr(e.message));
  useEffect(() => { load(); }, []);
  const cols: Col<A>[] = useMemo(() => [
    { key: "emp_id", label: "empID", get: r => r.emp_id }, { key: "department", label: "Department", get: r => r.department },
    { key: "name", label: "Faculty-Name", get: r => r.name }, { key: "subject", label: "Subject Teaching", get: r => r.subject },
    { key: "email", label: "Email", get: r => r.email },
    { key: "classes", label: "Classes Assigned", get: r => r.classes.map((c: A) => c.label + " sem " + c.semester).join("; ") },
    { key: "password", label: "Password", get: r => r.password, render: r => <PwCell r={r} /> },
  ], []);
  const save = async () => {
    setErr("");
    try {
      const body = { emp_id: form!.emp_id, department: form!.department, name: form!.name, subject: form!.subject, email: form!.email };
      form!.id ? await put(`/admin/faculty/${form!.id}`, tok, body) : await post("/admin/faculty", tok, body);
      setForm(null); load();
    } catch (e: A) { setErr(e.message); }
  };
  return (
    <div className="space-y-4">
      <UploadBox tok={tok} path="/admin/faculty/upload" noun="faculty" columns="Sr.No, empID, Department, Faculty-Name, Subject Teaching, Email" onDone={load} />
      <div className="card space-y-3">
        <div className="flex justify-between items-center"><h2 className="font-semibold">Faculty list</h2><button className="btn" onClick={() => { setErr(""); setForm({ emp_id: "", department: "", name: "", subject: "", email: "" }); }}>Add faculty</button></div>
        <p className="muted">The empID is the login ID. Put several subjects in one cell separated by commas.</p>
        <GenerateBar tok={tok} path="/admin/faculty/generate-passwords" sendPath="/admin/faculty/send-emails" rows={rows} onDone={load} />
        {err && !form && <p className="err" role="alert">{err}</p>}
        <DataTable cols={cols} rows={rows} emptyText="No faculty yet. Upload a sheet or add a row." onEdit={r => { setErr(""); setForm({ ...r }); }}
          onDelete={async r => { if (confirmDelete(r.name)) { try { await del(`/admin/faculty/${r.id}`, tok); load(); } catch (e: A) { setErr(e.message); } } }} />
      </div>
      {form && (
        <Modal title={form.id ? "Edit faculty" : "Add faculty"} onClose={() => setForm(null)}>
          <Field label="empID" value={form.emp_id} disabled={!!form.id} onChange={v => setForm({ ...form, emp_id: v })} help={form.id ? "The login ID cannot be changed. Delete and add again to change it." : undefined} />
          <Field label="Department" value={form.department} onChange={v => setForm({ ...form, department: v })} />
          <Field label="Faculty-Name" value={form.name} onChange={v => setForm({ ...form, name: v })} />
          <Field label="Subject Teaching" value={form.subject} onChange={v => setForm({ ...form, subject: v })} help="Separate several subjects with commas." />
          <Field label="Email" value={form.email} onChange={v => setForm({ ...form, email: v })} />
          {err && <p className="err mb-2" role="alert">{err}</p>}
          <button className="btn" onClick={save}>Save</button>
        </Modal>)}
    </div>
  );
}

/* ---------------- Panel 2: classes and assignment ---------------- */
function ClassPicker({ tok, fac, classes, onClose, onSaved }: { tok: string; fac: A; classes: A[]; onClose: () => void; onSaved: () => void }) {
  const [sel, setSel] = useState<Set<number>>(new Set(fac.classes.map((c: A) => c.id)));
  const [q, setQ] = useState("");
  const [sameDept, setSameDept] = useState(false);
  const [err, setErr] = useState("");
  const groups = useMemo(() => {
    const m = new Map<number, A[]>();
    classes.filter(c => (!sameDept || c.department.toLowerCase() === fac.department.toLowerCase()) && (!q || c.label.toLowerCase().includes(q.toLowerCase()))).forEach(c => m.set(c.semester, [...(m.get(c.semester) || []), c]));
    return [...m.entries()].sort((a, b) => a[0] - b[0]);
  }, [classes, q, sameDept, fac.department]);
  const toggle = (id: number) => { const n = new Set(sel); n.has(id) ? n.delete(id) : n.add(id); setSel(n); };
  const save = async () => { try { await put(`/admin/faculty/${fac.id}/classes`, tok, { class_ids: [...sel] }); onSaved(); onClose(); } catch (e: A) { setErr(e.message); } };
  return (
    <Modal title={`Classes for ${fac.name}`} onClose={onClose} wide>
      <p className="muted mb-2">Tick every class this faculty member will take for viva. {sel.size} selected.</p>
      <div className="flex gap-3 items-center mb-3">
        <input className="inp" placeholder="Search classes" aria-label="Search classes" value={q} onChange={e => setQ(e.target.value)} />
        <label className="text-sm whitespace-nowrap flex items-center gap-1"><input type="checkbox" checked={sameDept} onChange={e => setSameDept(e.target.checked)} />Only {fac.department}</label>
      </div>
      <div className="max-h-80 overflow-auto border border-stone-300 rounded p-3 space-y-3">
        {groups.length === 0 && <p className="muted">No classes found. Upload the class list first.</p>}
        {groups.map(([sem, list]) => (
          <fieldset key={sem}>
            <legend className="font-semibold text-sm mb-1">Semester {sem}</legend>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1">
              {list.map(c => <label key={c.id} className="text-sm flex items-center gap-2"><input type="checkbox" checked={sel.has(c.id)} onChange={() => toggle(c.id)} />{c.label}</label>)}
            </div>
          </fieldset>))}
      </div>
      {err && <p className="err mt-2" role="alert">{err}</p>}
      <div className="flex gap-2 mt-3"><button className="btn" onClick={save}>Save</button><button className="btn2" onClick={onClose}>Cancel</button></div>
    </Modal>
  );
}

export function ClassPanel({ tok }: { tok: string }) {
  const [classes, setClasses] = useState<A[]>([]);
  const [faculty, setFaculty] = useState<A[]>([]);
  const [form, setForm] = useState<A | null>(null);
  const [pick, setPick] = useState<A | null>(null);
  const [err, setErr] = useState("");
  const load = () => { call("/admin/classes", tok).then(setClasses).catch(e => setErr(e.message)); call("/admin/faculty", tok).then(setFaculty).catch(e => setErr(e.message)); };
  useEffect(() => { load(); }, []);
  const classCols: Col<A>[] = useMemo(() => [
    { key: "department", label: "Department", get: r => r.department }, { key: "semester", label: "Semester", get: r => String(r.semester) }, { key: "name", label: "Class", get: r => r.name }], []);
  const facCols: Col<A>[] = useMemo(() => [
    { key: "emp_id", label: "empID", get: r => r.emp_id }, { key: "department", label: "Department", get: r => r.department },
    { key: "name", label: "Faculty-Name", get: r => r.name }, { key: "subject", label: "Subject Teaching", get: r => r.subject },
    { key: "classes", label: "Classes Assigned", get: r => r.classes.map((c: A) => `Sem ${c.semester} ${c.label}`).join("; "),
      render: r => r.classes.length ? <ul>{[...r.classes].sort((a: A, b: A) => a.semester - b.semester).map((c: A) => <li key={c.id}>Sem {c.semester}: {c.label}</li>)}</ul> : <span className="text-stone-500">None</span> },
  ], []);
  const saveClass = async () => {
    setErr("");
    try {
      const body = { department: form!.department, semester: parseInt(form!.semester, 10), name: form!.name };
      if (!body.semester) { setErr("Semester must be a number"); return; }
      form!.id ? await put(`/admin/classes/${form!.id}`, tok, body) : await post("/admin/classes", tok, body);
      setForm(null); load();
    } catch (e: A) { setErr(e.message); }
  };
  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">1. Class list</h2>
        <UploadBox tok={tok} path="/admin/classes/upload" noun="class" columns="Department, Semester, Class" onDone={load} />
        <div className="card space-y-3">
          <div className="flex justify-between items-center"><h3 className="font-semibold">Classes</h3><button className="btn" onClick={() => { setErr(""); setForm({ department: "", semester: "", name: "" }); }}>Add class</button></div>
          {err && !form && <p className="err" role="alert">{err}</p>}
          <DataTable cols={classCols} rows={classes} emptyText="No classes yet. Upload the class list." onEdit={r => { setErr(""); setForm({ ...r, semester: String(r.semester) }); }}
            onDelete={async r => { if (window.confirm(`Delete class ${r.label} (semester ${r.semester})? It is removed from every faculty member it was assigned to.`)) { try { await del(`/admin/classes/${r.id}`, tok); load(); } catch (e: A) { setErr(e.message); } } }} />
        </div>
      </section>
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">2. Assign classes to faculty</h2>
        <div className="card space-y-3">
          <p className="muted">Faculty come from the Faculty panel. Use Select classes to choose one or more classes for viva, grouped by semester.</p>
          <DataTable cols={facCols} rows={faculty} emptyText="No faculty yet. Upload the faculty list in the Faculty panel first."
            actions={r => <button className="btn2 !px-2 !py-1 !text-xs" onClick={() => setPick(r)}>Select classes</button>} />
        </div>
      </section>
      {form && (
        <Modal title={form.id ? "Edit class" : "Add class"} onClose={() => setForm(null)}>
          <Field label="Department" value={form.department} onChange={v => setForm({ ...form, department: v })} />
          <Field label="Semester" value={form.semester} onChange={v => setForm({ ...form, semester: v })} />
          <Field label="Class" value={form.name} onChange={v => setForm({ ...form, name: v })} />
          {err && <p className="err mb-2" role="alert">{err}</p>}
          <button className="btn" onClick={saveClass}>Save</button>
        </Modal>)}
      {pick && <ClassPicker tok={tok} fac={pick} classes={classes} onClose={() => setPick(null)} onSaved={load} />}
    </div>
  );
}

/* ---------------- Panel 3: students ---------------- */
export function StudentPanel({ tok }: { tok: string }) {
  const [rows, setRows] = useState<A[]>([]);
  const [form, setForm] = useState<A | null>(null);
  const [err, setErr] = useState("");
  const load = () => call("/admin/students", tok).then(setRows).catch(e => setErr(e.message));
  useEffect(() => { load(); }, []);
  const maxSub = useMemo(() => rows.reduce((m, r) => Math.max(m, r.subjects.length), 0), [rows]);
  const cols: Col<A>[] = useMemo(() => {
    const base: Col<A>[] = [
      { key: "student_id", label: "Enrollment Number", get: r => r.student_id }, { key: "gr_number", label: "GR Number", get: r => r.gr_number },
      { key: "name", label: "Name", get: r => r.name }, { key: "department", label: "Department", get: r => r.department }, { key: "class_code", label: "Class", get: r => r.class_code }, { key: "email", label: "Email", get: r => r.email }];
    const subs: Col<A>[] = Array.from({ length: maxSub }, (_, i) => ({
      key: "s" + i, label: `Subject${i + 1}`,
      get: (r: A) => r.subjects[i] ? `${r.subjects[i].subject} ${r.subjects[i].faculty.join(" ")}` : "",
      render: (r: A) => { const s = r.subjects[i]; return !s || !s.subject ? null : <div><div>{s.subject}</div><div className="text-xs text-stone-600">{s.faculty.length ? s.faculty.join(", ") : "No faculty assigned"}</div></div>; } }));
    return [...base, ...subs, { key: "password", label: "Password", get: (r: A) => r.password, render: (r: A) => <PwCell r={r} /> }];
  }, [maxSub]);
  const save = async () => {
    setErr("");
    try {
      const body = { student_id: form!.student_id, gr_number: form!.gr_number, name: form!.name, department: form!.department, class_code: form!.class_code,
        subjects: form!.subjects.split("\n").map((s: string) => s.trim()), email: form!.email };
      form!.id ? await put(`/admin/students/${form!.id}`, tok, body) : await post("/admin/students", tok, body);
      setForm(null); load();
    } catch (e: A) { setErr(e.message); }
  };
  return (
    <div className="space-y-4">
      <UploadBox tok={tok} path="/admin/students/upload" noun="student" columns="Sr.No, Enrollment Number, GR Number, Name, Class, Department, Email, Subject1, Subject2 and so on" onDone={load} />
      <div className="card space-y-3">
        <div className="flex justify-between items-center"><h2 className="font-semibold">Student list</h2><button className="btn" onClick={() => { setErr(""); setForm({ student_id: "", gr_number: "", name: "", department: "", class_code: "", subjects: "", email: "" }); }}>Add student</button></div>
        <p className="muted">The Enrollment Number is the login ID. Under each subject, the faculty assigned to that subject for the student's class is shown.</p>
        <GenerateBar tok={tok} path="/admin/students/generate-passwords" sendPath="/admin/students/send-emails" rows={rows} onDone={load} />
        {err && !form && <p className="err" role="alert">{err}</p>}
        <DataTable cols={cols} rows={rows} emptyText="No students yet. Upload a sheet or add a row." onEdit={r => { setErr(""); setForm({ ...r, subjects: r.subjects.map((s: A) => s.subject).join("\n") }); }}
          onDelete={async r => { if (confirmDelete(r.name)) { try { await del(`/admin/students/${r.id}`, tok); load(); } catch (e: A) { setErr(e.message); } } }} />
      </div>
      {form && (
        <Modal title={form.id ? "Edit student" : "Add student"} onClose={() => setForm(null)} wide>
          <div className="grid sm:grid-cols-2 gap-x-4">
            <Field label="Enrollment Number" value={form.student_id} disabled={!!form.id} onChange={v => setForm({ ...form, student_id: v })} help={form.id ? "The login ID cannot be changed." : undefined} />
            <Field label="GR Number" value={form.gr_number} onChange={v => setForm({ ...form, gr_number: v })} />
            <Field label="Name" value={form.name} onChange={v => setForm({ ...form, name: v })} />
            <Field label="Department" value={form.department} onChange={v => setForm({ ...form, department: v })} />
            <Field label="Class" value={form.class_code} onChange={v => setForm({ ...form, class_code: v })} />
            <Field label="Email" value={form.email} onChange={v => setForm({ ...form, email: v })} />
          </div>
          <Field label="Subjects" textarea value={form.subjects} onChange={v => setForm({ ...form, subjects: v })} help="One subject per line, in column order (Subject1, Subject2, ...)." />
          {err && <p className="err mb-2" role="alert">{err}</p>}
          <button className="btn" onClick={save}>Save</button>
        </Modal>)}
    </div>
  );
}

/* ---------------- Password requests ---------------- */
export function ResetPanel({ tok }: { tok: string }) {
  const [rows, setRows] = useState<A[]>([]);
  const [shown, setShown] = useState<A | null>(null);
  const [who, setWho] = useState("");
  const [err, setErr] = useState("");
  const load = () => call("/admin/reset-requests", tok).then(setRows).catch(e => setErr(e.message));
  useEffect(() => { load(); }, []);
  const cols: Col<A>[] = useMemo(() => [
    { key: "username", label: "ID", get: r => r.username }, { key: "name", label: "Name", get: r => r.name }, { key: "role", label: "Role", get: r => r.role },
    { key: "status", label: "Status", get: r => r.status }, { key: "created_at", label: "Requested", get: r => new Date(r.created_at + "Z").toLocaleString() }], []);
  const run = async (fn: () => Promise<A>) => { setErr(""); try { const r = await fn(); if (r.password) setShown(r); load(); } catch (e: A) { setErr(e.message); } };
  return (
    <div className="space-y-4">
      <div className="card space-y-2">
        <h2 className="font-semibold">Password requests</h2>
        <p className="muted">People who forget their password send a request from the sign-in page. Check who they are first (in person, or through the institution's usual channel), then approve. They get a temporary password and must choose a new one at their next sign-in.</p>
        <div className="flex gap-2 max-w-md"><input className="inp" placeholder="Reset by ID (empID or enrollment number)" aria-label="ID to reset" value={who} onChange={e => setWho(e.target.value)} />
          <button className="btn2 whitespace-nowrap" disabled={!who.trim()} onClick={() => { if (window.confirm(`Issue a new temporary password for ${who.trim()}? Their current password stops working.`)) run(() => post("/admin/accounts/reset-password", tok, { username: who })); }}>Reset password</button></div>
        {err && <p className="err" role="alert">{err}</p>}
      </div>
      <div className="card">
        <DataTable cols={cols} rows={rows} emptyText="No requests." actions={r => r.status === "pending" ? (<>
          <button className="btn !px-2 !py-1 !text-xs" onClick={() => run(() => post(`/admin/reset-requests/${r.id}/approve`, tok))}>Approve</button>
          <button className="btns" onClick={() => run(() => post(`/admin/reset-requests/${r.id}/reject`, tok))}>Reject</button></>) : null} />
      </div>
      {shown && (
        <Modal title="Temporary password" onClose={() => setShown(null)}>
          <p className="text-sm mb-2">Give this to <b>{shown.username}</b> after verifying their identity. It is also shown in the Password column of their table until they change it.</p>
          <p className="text-2xl font-mono bg-stone-100 rounded p-3 text-center select-all">{shown.password}</p>
        </Modal>)}
    </div>
  );
}
