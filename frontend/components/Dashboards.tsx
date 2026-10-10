"use client";
import { useEffect, useState } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from "recharts";
import { A, call, post, pct } from "../lib/api";

export function Staff({ auth }: { auth: A }) {
  const t = auth.access_token;
  const [list, setList] = useState<A[]>([]); const [sel, setSel] = useState<string | null>(null); const [ins, setIns] = useState<A[]>([]); const [q, setQ] = useState("");
  useEffect(() => { call("/students", t).then(setList).catch(() => {}); call("/insights", t).then(setIns).catch(() => {}); }, []);
  const shown = list.filter(s => (s.name + " " + s.student_id + " " + (s.class_code || "")).toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="grid md:grid-cols-3 gap-4">
      <div className="card md:col-span-1 space-y-2 max-h-[80vh] overflow-auto">
        <h2 className="font-semibold">Students, highest risk first</h2>
        <input className="inp" placeholder="Search by name, ID or class" aria-label="Search students" value={q} onChange={e => setQ(e.target.value)} />
        {list.length === 0 && <p className="muted">No students are visible to you yet. Students appear here once the administrator assigns your classes or students.</p>}
        {shown.map(s => (
          <button key={s.student_id} onClick={() => setSel(s.student_id)} className={`w-full text-left px-2 py-1.5 rounded flex justify-between hover:bg-stone-100 ${sel === s.student_id ? "bg-teal-50 border border-teal-700" : "border border-transparent"}`}>
            <span>{s.name}<span className="text-xs text-stone-600"> {s.class_code}</span></span>
            <span className={s.at_risk ? "text-red-800 font-semibold" : "text-stone-700"}>{pct(s.risk)}</span>
          </button>))}
        <h2 className="font-semibold pt-3">Insights</h2>
        {ins.length === 0 && <p className="muted">No approved insights yet.</p>}
        {ins.map(i => <p key={i.id} className="text-sm border-t border-stone-200 pt-1"><b>{i.title}.</b> {i.body}</p>)}
      </div>
      <div className="md:col-span-2">{sel ? <Detail key={sel} tok={t} sid={sel} role={auth.role} /> : <div className="card muted">Select a student.</div>}</div>
    </div>
  );
}

export function StudentHome({ auth }: { auth: A }) {
  const t = auth.access_token;
  const [q, setQ] = useState(""); const [chat, setChat] = useState<{ q: string; a: string }[]>([]); const [busy, setBusy] = useState(false); const [peer, setPeer] = useState("");
  const ask = async () => { setBusy(true); try { const r = await post("/copilot", t, { question: q }); setChat([...chat, { q, a: r.answer }]); setQ(""); } catch (e: A) { setChat([...chat, { q, a: "Error: " + e.message }]); } finally { setBusy(false); } };
  return (
    <div className="grid md:grid-cols-3 gap-4">
      <div className="md:col-span-2"><Detail tok={t} sid={auth.student_id} role="student" /></div>
      <div className="card space-y-2 self-start">
        <h2 className="font-semibold">Study assistant</h2>
        <p className="muted">Answers use only your own records.</p>
        {chat.map((c, i) => <div key={i} className="text-sm border-t border-stone-200 pt-1"><p className="font-medium">{c.q}</p><p>{c.a}</p></div>)}
        <input className="inp" placeholder="What should I focus on this week?" aria-label="Ask the study assistant" value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === "Enter" && q && !busy && ask()} />
        <button className="btn" disabled={!q || busy} onClick={ask}>Ask</button>
        <div className="border-t border-stone-200 pt-2 space-y-1">
          <p className="muted">Study partner suggestions only include students who opted in.</p>
          <button className="btn2" onClick={async () => { await post("/me/peer-opt-in?on=true", t); setPeer("You are included in peer matching."); }}>Opt in to peer matching</button>
          <button className="btn2 ml-2" onClick={async () => { await post("/me/peer-opt-in?on=false", t); setPeer("You are not included in peer matching."); }}>Opt out</button>
          {peer && <p className="text-sm" role="status">{peer}</p>}
        </div>
      </div>
    </div>
  );
}

function Detail({ tok, sid, role }: { tok: string; sid: string; role: string }) {
  const [d, setD] = useState<A>(null); const [w, setW] = useState<A>({}); const [res, setRes] = useState<A>(null); const [note, setNote] = useState(""); const [peers, setPeers] = useState<A[]>([]); const [err, setErr] = useState("");
  const load = () => call(`/students/${sid}`, tok).then(x => { setD(x); setW(x.risk.features || {}); }).catch(e => setErr(e.message));
  useEffect(() => { load(); call(`/students/${sid}/peers`, tok).then(setPeers).catch(() => {}); }, [sid]);
  if (err) return <div className="card err">{err}</div>;
  if (!d) return <div className="card">Loading...</div>;
  const run = async () => setRes(await post(`/students/${sid}/whatif`, tok, { overrides: { attendance_pct: w.attendance_pct, assignment_completion_pct: w.assignment_completion_pct, lms_logins_per_week: w.lms_logins_per_week, mentor_assigned: w.mentor_assigned } }));
  const slider = (k: string, label: string, max = 100) => (
    <label className="block text-sm">{label}: <b>{Math.round(w[k] ?? 0)}</b>
      <input type="range" min={0} max={max} value={w[k] ?? 0} onChange={e => setW({ ...w, [k]: +e.target.value })} className="w-full accent-teal-800" /></label>);
  const noData = d.risk.risk == null;
  return (
    <div className="space-y-4">
      <div className="card flex justify-between items-center">
        <div><h2 className="text-lg font-bold">{d.student.name}</h2><p className="muted">{d.student.student_id} / {d.student.branch} / {d.student.class_code}</p></div>
        <div className="text-right"><p className="text-3xl font-bold">{pct(d.risk.risk)}</p><p className="text-xs text-stone-600">estimated risk ({d.risk.method})</p></div>
      </div>
      {noData ? <div className="card muted">No academic records have been loaded for this student yet.</div> : <>
        <div className="card">
          <h3 className="font-semibold">Main reasons behind this estimate</h3>
          {d.risk.reasons.length ? <ul className="list-disc ml-5 text-sm">{d.risk.reasons.map((r: A) => <li key={r.feature}>{r.label} (current value {r.value.toFixed(1)})</li>)}</ul> : <p className="muted">No risk drivers found.</p>}
        </div>
        <div className="card">
          <h3 className="font-semibold">Journey timeline</h3>
          <div className="h-64"><ResponsiveContainer><LineChart data={d.timeline}>
            <XAxis dataKey="semester" label={{ value: "Semester", position: "insideBottom", offset: -2 }} /><YAxis domain={[0, 100]} /><Tooltip /><Legend />
            <Line dataKey="internal_marks" name="Marks" stroke="#115e59" /><Line dataKey="attendance_pct" name="Attendance %" stroke="#1d4ed8" /><Line dataKey="quiz_avg" name="Quiz average" stroke="#b45309" />
            {d.events.map((e: A, i: number) => <ReferenceLine key={i} x={e.semester} stroke={e.type === "alert" ? "#b91c1c" : e.type === "recovery" ? "#15803d" : "#b45309"} strokeDasharray="4 3" label={{ value: e.text, fontSize: 10, position: "top" }} />)}
          </LineChart></ResponsiveContainer></div>
        </div>
        <div className="card space-y-2">
          <h3 className="font-semibold">What-if simulator</h3>
          <div className="grid sm:grid-cols-2 gap-3">
            {slider("attendance_pct", "Attendance %")}{slider("assignment_completion_pct", "Assignment completion %")}{slider("lms_logins_per_week", "Learning platform logins per week", 20)}
            <label className="text-sm flex items-center gap-2"><input type="checkbox" checked={!!w.mentor_assigned} onChange={e => setW({ ...w, mentor_assigned: e.target.checked ? 1 : 0 })} />Mentor assigned</label>
          </div>
          <button className="btn" onClick={run}>Re-estimate risk</button>
          {res && <p className="text-sm">Risk changes from {pct(res.before)} to <b>{pct(res.after)}</b>. <span className="text-stone-600">{res.disclaimer}</span></p>}
        </div>
      </>}
      <div className="card space-y-2">
        <div className="flex justify-between"><h3 className="font-semibold">Intervention plans</h3>
          {role === "mentor" && !noData && <button className="btn" onClick={async () => { await post(`/students/${sid}/plan`, tok); load(); }}>Generate draft plan</button>}</div>
        {d.plans.length === 0 && <p className="muted">{role === "student" ? "No approved plan yet." : "No plans yet."}</p>}
        {d.plans.map((p: A) => <PlanBox key={p.id} p={p} tok={tok} role={role} reload={load} />)}
      </div>
      {peers.length > 0 && <div className="card"><h3 className="font-semibold">Suggested study partners</h3>{peers.map(p => <p key={p.student_id} className="text-sm">{p.name}, strong in {p.strong_in.join(", ")}</p>)}</div>}
      {role !== "student" && <div className="card space-y-2"><h3 className="font-semibold">Notes</h3>
        {d.notes.map((n: A, i: number) => <p key={i} className="text-sm border-t border-stone-200 pt-1">{n.text} <span className="text-xs text-stone-600">by {n.author}</span></p>)}
        <div className="flex gap-2"><input className="inp" aria-label="New note" value={note} onChange={e => setNote(e.target.value)} placeholder="Add a note" /><button className="btn" disabled={!note} onClick={async () => { await post(`/students/${sid}/notes`, tok, { text: note }); setNote(""); load(); }}>Add</button></div></div>}
    </div>
  );
}

function PlanBox({ p, tok, role, reload }: { p: A; tok: string; role: string; reload: () => void }) {
  const actions: string[] = p.content.actions;
  const [txt, setTxt] = useState(actions.join("\n")); const sim = p.content.simulation;
  return (
    <div className="border border-stone-300 rounded p-3 space-y-2">
      <p className="text-xs uppercase tracking-wide text-stone-600">{p.status === "draft" ? "Draft, waiting for mentor approval" : "Approved"}</p>
      {role === "mentor" && p.status === "draft" ? <textarea className="inp h-28" aria-label="Plan actions, one per line" value={txt} onChange={e => setTxt(e.target.value)} />
        : <ul className="list-disc ml-5 text-sm">{actions.map((a, i) => <li key={i}>{a}</li>)}</ul>}
      <p className="text-xs text-stone-600">Simulated risk from {pct(sim.before)} to {pct(sim.after)}. This is an estimate, not a guarantee.</p>
      {role === "mentor" && p.status === "draft" && <button className="btn" onClick={async () => {
        await call(`/plans/${p.id}`, tok, { method: "PATCH", body: JSON.stringify({ actions: txt.split("\n").filter(Boolean) }) });
        await post(`/plans/${p.id}/approve`, tok); reload(); }}>Save and approve</button>}
      {p.status === "approved" && role !== "student" && p.followups.map((f: A) => <p key={f.day} className="text-xs">Day {f.day}, due {f.due}: {f.status}
        {role === "mentor" && f.status === "pending" && <button className="underline ml-2" onClick={async () => { await post(`/plans/${p.id}/followup`, tok, { day: f.day, status: "done" }); reload(); }}>mark done</button>}</p>)}
    </div>
  );
}
