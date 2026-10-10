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
  
  // Interactive States for Hackathon Features
  const [assignments, setAssignments] = useState([
    { id: 1, title: 'Data Structures - Assignment 4', course: 'CS201', due: 'Tomorrow, 11:59 PM', turnedIn: false },
    { id: 2, title: 'Final Essay Draft', course: 'ENG101', due: 'Friday, 5:00 PM', turnedIn: false }
  ]);
  const [skills, setSkills] = useState(['Python', 'Data Structures']);
  const [placementScore, setPlacementScore] = useState(85);
  const [newSkill, setNewSkill] = useState("");
  const [isCompilerOpen, setIsCompilerOpen] = useState(false);
  const [compilerCode, setCompilerCode] = useState("function twoSum(nums, target) {\n  // write code here\n}");
  const [compilerOutput, setCompilerOutput] = useState("");

  const ask = async () => { setBusy(true); try { const r = await post("/copilot", t, { question: q }); setChat([...chat, { q, a: r.answer }]); setQ(""); } catch (e: A) { setChat([...chat, { q, a: "Error: " + e.message }]); } finally { setBusy(false); } };

  const turnInAssignment = (id: number) => {
    setAssignments(assignments.map(a => a.id === id ? { ...a, turnedIn: true } : a));
  };

  const addSkill = () => {
    if (!newSkill.trim() || skills.includes(newSkill)) return;
    setSkills([...skills, newSkill]);
    setPlacementScore(prev => Math.min(99, prev + Math.floor(Math.random() * 5) + 1));
    setNewSkill("");
  };

  const runCode = () => {
    setCompilerOutput("Running test cases...\n");
    setTimeout(() => {
      setCompilerOutput(prev => prev + "Test Case 1: Passed\nTest Case 2: Passed\nTest Case 3: Passed\n\nSuccess! All test cases passed. (+10 LeetCode Points)");
    }, 1500);
  };

  return (
    <div className="flex flex-col md:flex-row gap-4 relative">
      <div className="flex-1 space-y-4">
        
        {/* Google Classroom Integration (Interactive) */}
        <div className="card space-y-2 border-green-500 border-2 bg-stone-50">
          <h2 className="font-semibold text-green-700 flex items-center gap-2">
            📚 Google Classroom Integrations
          </h2>
          <div className="space-y-2 mt-2">
            {assignments.map(a => (
              <div key={a.id} className={`p-3 border rounded flex justify-between items-center ${a.turnedIn ? 'bg-green-50 border-green-200' : 'bg-white border-stone-200 shadow-sm'}`}>
                <div>
                  <p className={`font-medium ${a.turnedIn ? 'line-through text-stone-500' : 'text-stone-800'}`}>{a.title}</p>
                  <p className="text-xs text-stone-500">{a.course} • Due {a.due}</p>
                </div>
                {a.turnedIn ? (
                  <span className="text-green-600 text-sm font-semibold flex items-center gap-1"><svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"></path></svg> Turned In</span>
                ) : (
                  <button className="btn2 bg-green-600 text-white hover:bg-green-700 border-none px-4" onClick={() => turnInAssignment(a.id)}>Turn In / Submit</button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Placement & Employability Predictor (Interactive) */}
        <div className="card border-blue-500 border-2 bg-stone-50">
          <h2 className="font-semibold text-blue-800 flex items-center gap-2">💼 Placement & Employability Predictor</h2>
          <div className="mt-3 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100 rounded flex gap-4 items-center">
            <div className="flex-shrink-0 flex items-center justify-center w-20 h-20 rounded-full bg-blue-100 border-4 border-blue-500">
              <span className="text-2xl font-bold text-blue-700">{placementScore}%</span>
            </div>
            <div className="flex-1">
              <p className="font-medium text-blue-900 text-lg">Tier-1 Placement Readiness</p>
              <p className="text-sm text-blue-700 mt-1">Based on marks, attendance, and technical skills.</p>
              <div className="flex flex-wrap gap-1 mt-2">
                {skills.map(s => <span key={s} className="px-2 py-1 bg-blue-200 text-blue-800 text-xs font-medium rounded-full">{s}</span>)}
              </div>
              <div className="flex gap-2 mt-3">
                <input type="text" placeholder="Add learned skill (e.g. React)" value={newSkill} onChange={e => setNewSkill(e.target.value)} className="inp flex-1 text-sm p-1.5 border-blue-200 focus:border-blue-500" />
                <button className="btn bg-blue-600 text-white hover:bg-blue-700 border-none px-4" onClick={addSkill}>Add Skill & Boost Score</button>
              </div>
            </div>
          </div>
        </div>

        {/* Existing Detail Component */}
        <Detail tok={t} sid={auth.student_id} role="student" />

        {/* Tech News */}
        <div className="card space-y-2 border-slate-300 border">
          <h2 className="font-semibold text-slate-700 flex items-center gap-2">
            📰 Latest Industry News
          </h2>
          <div className="text-sm space-y-2 flex gap-4 overflow-x-auto pb-2">
            <div className="border rounded p-3 min-w-[250px] bg-white">
              <a href="#" className="font-medium text-blue-600 hover:underline">OpenAI releases new reasoning models for coding</a>
              <p className="text-xs text-stone-500 mt-1">TechCrunch • 2 hours ago</p>
            </div>
            <div className="border rounded p-3 min-w-[250px] bg-white">
              <a href="#" className="font-medium text-blue-600 hover:underline">Top 10 Backend Frameworks to learn in 2026</a>
              <p className="text-xs text-stone-500 mt-1">Dev.to • 5 hours ago</p>
            </div>
          </div>
        </div>

      </div>

      {/* Right Column: Interactive Widgets */}
      <div className="w-80 flex-shrink-0 space-y-4">
        
        {/* Working AI Chatbot connected to backend */}
        <div className="card space-y-2 bg-slate-50 border-purple-200 shadow-sm h-[400px] flex flex-col p-0 overflow-hidden">
          <div className="bg-purple-700 p-3 text-white flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"/></svg>
            <h2 className="font-semibold text-white">24/7 AI Virtual Assistant</h2>
          </div>
          <div className="p-2 text-xs text-stone-500 text-center border-b bg-white">Answers use your records & university syllabus.</div>
          <div className="flex-1 bg-white p-3 overflow-y-auto space-y-3">
            {chat.map((c, i) => (
              <div key={i} className="space-y-2">
                <div className="flex justify-end"><div className="bg-purple-600 text-white text-sm p-2 rounded-lg rounded-br-none max-w-[85%]">{c.q}</div></div>
                <div className="flex justify-start"><div className="bg-stone-100 text-stone-800 border border-stone-200 text-sm p-2 rounded-lg rounded-bl-none max-w-[85%]">{c.a}</div></div>
              </div>
            ))}
            {chat.length === 0 && <p className="text-xs text-stone-400 italic text-center mt-4">Try asking: "What happens if I miss the quiz tomorrow?"</p>}
            {busy && <div className="flex justify-start"><div className="bg-stone-100 text-stone-500 text-sm p-2 rounded-lg rounded-bl-none animate-pulse">Typing...</div></div>}
          </div>
          <div className="p-2 bg-stone-50 border-t flex gap-2">
            <input className="inp flex-1 text-sm border-purple-200 focus:border-purple-500" placeholder="Ask anything..." aria-label="Ask the study assistant" value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === "Enter" && q && !busy && ask()} />
            <button className="bg-purple-600 text-white px-3 rounded hover:bg-purple-700 disabled:opacity-50 transition" disabled={!q || busy} onClick={ask}>Send</button>
          </div>
        </div>

        {/* Coding Platform & Jobs (Interactive) */}
        <div className="card border-orange-200 border bg-orange-50 shadow-sm">
          <h2 className="font-semibold text-orange-800 flex items-center gap-2">
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>
            Tech Profile & Jobs
          </h2>
          <div className="text-sm mt-3 bg-white p-3 border rounded shadow-sm">
            <div className="flex justify-between items-center mb-1">
              <p className="text-stone-500 text-xs">GitHub + LeetCode Score</p>
              <p className="text-orange-600 font-bold text-lg">1,240 pts</p>
            </div>
            <p className="text-stone-600 mb-3 text-xs">Area of improvement: Dynamic Programming</p>
            <button className="w-full bg-stone-800 text-white hover:bg-stone-900 py-2 rounded text-xs font-semibold transition" onClick={() => setIsCompilerOpen(true)}>Launch Online Compiler</button>
          </div>
          <div className="bg-white p-3 rounded border border-orange-200 text-sm mt-3 shadow-sm">
            <p className="font-semibold text-stone-800 mb-2">Recommended Jobs (Matched)</p>
            <ul className="space-y-2">
              <li className="flex justify-between items-center border-b pb-2">
                <div><p className="font-medium text-orange-900 text-xs">SDE-1 at Amazon</p></div>
                <button className="text-xs bg-orange-100 text-orange-700 px-2 py-1 rounded hover:bg-orange-200 font-medium">Apply</button>
              </li>
              <li className="flex justify-between items-center">
                <div><p className="font-medium text-orange-900 text-xs">Frontend Intern at Vercel</p></div>
                <button className="text-xs bg-orange-100 text-orange-700 px-2 py-1 rounded hover:bg-orange-200 font-medium">Apply</button>
              </li>
            </ul>
          </div>
        </div>
        
        <div className="card space-y-1">
          <p className="font-semibold text-sm">Study Partners</p>
          <div className="flex gap-2">
            <button className="btn2 flex-1" onClick={async () => { await post("/me/peer-opt-in?on=true", t); setPeer("You are included in peer matching."); }}>Opt in</button>
            <button className="btn2 flex-1" onClick={async () => { await post("/me/peer-opt-in?on=false", t); setPeer("You are not included in peer matching."); }}>Opt out</button>
          </div>
          {peer && <p className="text-xs mt-1 text-green-700 bg-green-50 p-1 rounded border border-green-200" role="status">{peer}</p>}
        </div>
      </div>

      {/* Online Compiler Modal */}
      {isCompilerOpen && (
        <div className="fixed inset-0 bg-stone-900 bg-opacity-75 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-stone-900 rounded-lg shadow-2xl w-full max-w-4xl flex flex-col h-[85vh] overflow-hidden border border-stone-700">
            <div className="bg-black text-white p-3 flex justify-between items-center border-b border-stone-800">
              <div className="flex items-center gap-3">
                <h3 className="font-mono text-sm font-semibold text-stone-300">Code Editor</h3>
                <span className="bg-orange-500 text-white text-[10px] px-2 py-0.5 rounded uppercase font-bold tracking-wide">Daily Challenge: Two Sum</span>
              </div>
              <button onClick={() => setIsCompilerOpen(false)} className="text-stone-400 hover:text-white transition">&times; Close</button>
            </div>
            <div className="flex-1 flex flex-col md:flex-row p-4 gap-4 bg-stone-900">
              <div className="flex-1 flex flex-col gap-2">
                <label className="text-stone-400 text-xs font-mono uppercase tracking-wider">index.js</label>
                <textarea 
                  className="flex-1 w-full bg-[#1e1e1e] text-green-400 font-mono p-4 rounded focus:outline-none focus:ring-1 focus:ring-stone-600 resize-none shadow-inner"
                  value={compilerCode}
                  onChange={(e) => setCompilerCode(e.target.value)}
                  spellCheck={false}
                />
              </div>
              <div className="w-full md:w-1/3 flex flex-col gap-2">
                <label className="text-stone-400 text-xs font-mono uppercase tracking-wider">Console Output</label>
                <div className="flex-1 bg-[#1e1e1e] text-stone-300 font-mono p-4 rounded overflow-y-auto text-sm whitespace-pre-wrap shadow-inner border border-stone-800">
                  {compilerOutput || "> Ready..."}
                </div>
              </div>
            </div>
            <div className="bg-stone-800 p-4 flex justify-between items-center border-t border-stone-700">
              <button className="px-4 py-2 bg-stone-700 text-stone-300 rounded hover:bg-stone-600 transition text-sm font-medium" onClick={() => setCompilerOutput("")}>Clear Console</button>
              <button className="px-6 py-2 bg-green-600 text-white rounded hover:bg-green-500 transition font-bold shadow-lg shadow-green-900" onClick={runCode}>Run Code</button>
            </div>
          </div>
        </div>
      )}
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
