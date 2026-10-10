"use client";
import { useEffect, useState } from "react";
import { A, call, post } from "../lib/api";

export function AdminAnalytics({ tok }: { tok: string }) {
  const [a, setA] = useState<A>(null); const [msg, setMsg] = useState(""); const [ins, setIns] = useState<A[]>([]); const [nu, setNu] = useState<A>({ role: "mentor", username: "", name: "", password: "" });
  const refresh = () => { call("/admin/analytics", tok).then(setA).catch(() => {}); call("/insights", tok).then(setIns).catch(() => {}); };
  useEffect(refresh, []);
  const act = async (fn: () => Promise<A>) => { try { setMsg(JSON.stringify(await fn())); refresh(); } catch (e: A) { setMsg("Error: " + e.message); } };
  return (
    <div className="grid md:grid-cols-2 gap-4">
      <div className="card space-y-2">
        <h2 className="font-semibold">Academic data and model</h2>
        <p className="muted">Step 1: upload the academic CSV or Excel file. Use the enrollment number as student_id so records match the student list. Required columns: name, branch, semester. Optional: student_id, class_code, mentor_email, attendance_pct, internal_marks, quiz_avg, assignment_completion_pct, lms_logins_per_week, prior_cgpa, intervention_flag, outcome_flag.</p>
        <input type="file" accept=".csv,.xlsx" aria-label="Academic data file" onChange={e => { const f = e.target.files?.[0]; if (f) { const fd = new FormData(); fd.append("file", f); act(() => call("/ingest/upload", tok, { method: "POST", body: fd })); } }} />
        <div className="flex flex-wrap gap-2">
          <button className="btn" onClick={() => act(() => post("/admin/train", tok))}>Step 2: Train or retrain model</button>
          <button className="btn2" onClick={() => act(() => post("/insights/generate", tok))}>Step 3: Generate insights</button>
        </div>
        {msg && <pre className="text-xs bg-stone-100 p-2 rounded overflow-auto max-h-40 whitespace-pre-wrap" role="status">{msg}</pre>}
      </div>
      <div className="card space-y-2">
        <h2 className="font-semibold">Create mentor or admin account</h2>
        <p className="muted">Faculty and students are created from their own panels. Mentors see students whose mentor_email equals the mentor's username.</p>
        {[["username", "Username (for mentors, use the email in the sheet)"], ["name", "Name"], ["password", "Password (at least 8 characters)"]].map(([k, l]) =>
          <label key={k} className="block"><span className="lbl">{l}</span><input className="inp" type={k === "password" ? "password" : "text"} value={nu[k]} onChange={e => setNu({ ...nu, [k]: e.target.value })} /></label>)}
        <label className="block"><span className="lbl">Role</span><select className="inp" value={nu.role} onChange={e => setNu({ ...nu, role: e.target.value })}><option>mentor</option><option>admin</option></select></label>
        <button className="btn" onClick={() => act(() => post("/admin/users", tok, nu))}>Create account</button>
      </div>
      <div className="card space-y-1">
        <h2 className="font-semibold">Institution analytics (anonymised)</h2>
        {!a || !a.students ? <p className="muted">No data yet.</p> : <>
          <p className="text-sm">{a.students} students, {a.pct_at_risk}% estimated at risk</p>
          <table className="text-sm w-full"><tbody>{a.branches.map((b: A) => <tr key={b.branch} className="border-t border-stone-200"><td className="py-1">{b.branch}</td>{b.suppressed ? <td colSpan={3} className="text-stone-600">hidden, fewer than 5 students</td> : <><td>n={b.n}</td><td>attendance {b.avg_attendance}%</td><td>{b.pct_at_risk}% at risk</td></>}</tr>)}</tbody></table>
          <h3 className="font-medium pt-2">Segments</h3>{a.clusters.map((c: A) => <p key={c.segment} className="text-sm">{c.segment}: {c.n} students, attendance {c.avg_attendance}%, marks {c.avg_marks}</p>)}
          {a.model && <p className="text-xs pt-2 text-stone-600">Model: AUC {a.model.auc?.toFixed(2)}, recall {a.model.recall.toFixed(2)}, precision {a.model.precision.toFixed(2)}.{a.model.fairness?.flag && " Warning: recall differs noticeably between branches."}</p>}</>}
      </div>
      <div className="card space-y-1">
        <h2 className="font-semibold">Insights awaiting review</h2>
        <p className="muted">Faculty and mentors only see approved insights.</p>
        {ins.length === 0 && <p className="muted">None yet. Generate insights after training.</p>}
        {ins.map(i => <div key={i.id} className="text-sm border-t border-stone-200 pt-1"><b>{i.title}</b> {i.approved ? <span className="text-stone-600">(approved)</span> : <button className="underline" onClick={() => act(() => post(`/insights/${i.id}/approve`, tok))}>approve</button>}<br />{i.body}</div>)}
      </div>
    </div>
  );
}
