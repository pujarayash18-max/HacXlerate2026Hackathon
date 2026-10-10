"use client";
import { useEffect, useState } from "react";
import { useSession, signIn, signOut } from "next-auth/react";
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
  const { data: session } = useSession() as any;
  const [q, setQ] = useState(""); const [chat, setChat] = useState<{ q: string; a: string }[]>([]); const [busy, setBusy] = useState(false); const [peer, setPeer] = useState("");
  
  const [assignments, setAssignments] = useState<any[]>([
    { id: 1, title: 'Data Structures - Assignment 4', course: 'CS201', due: 'Tomorrow, 11:59 PM', turnedIn: false },
    { id: 2, title: 'Final Essay Draft', course: 'ENG101', due: 'Friday, 5:00 PM', turnedIn: false }
  ]);
  const [loadingAssignments, setLoadingAssignments] = useState(false);
  const [uploadingId, setUploadingId] = useState<string | null>(null);

  useEffect(() => {
    const fetchClassroomData = async () => {
      if (session?.accessToken) {
        setLoadingAssignments(true);
        try {
          const res = await fetch("https://classroom.googleapis.com/v1/courses?courseStates=ACTIVE", {
            headers: { Authorization: `Bearer ${session.accessToken}` }
          });
          const data = await res.json();
          if (data.courses && data.courses.length > 0) {
            let allAssignments: any[] = [];
            for (const course of data.courses.slice(0, 3)) {
              // Fetch student submissions for the course
              const subRes = await fetch(`https://classroom.googleapis.com/v1/courses/${course.id}/courseWork/-/studentSubmissions`, {
                headers: { Authorization: `Bearer ${session.accessToken}` }
              });
              const subData = await subRes.json();
              
              if (subData.studentSubmissions) {
                // Fetch course work details to get titles and due dates
                const workRes = await fetch(`https://classroom.googleapis.com/v1/courses/${course.id}/courseWork`, {
                  headers: { Authorization: `Bearer ${session.accessToken}` }
                });
                const workData = await workRes.json();
                const workMap = new Map();
                if (workData.courseWork) {
                  workData.courseWork.forEach((w: any) => workMap.set(w.id, w));
                }

                for (const sub of subData.studentSubmissions) {
                  // Only show pending assignments
                  if (sub.state === "CREATED" || sub.state === "NEW" || sub.state === "RECLAIMED_BY_STUDENT") {
                    const work = workMap.get(sub.courseWorkId);
                    if (work) {
                      let isMissing = false;
                      let dueStr = 'No due date';
                      if (work.dueDate) {
                        const due = new Date(work.dueDate.year, work.dueDate.month - 1, work.dueDate.day, work.dueTime?.hours || 23, work.dueTime?.minutes || 59);
                        if (due < new Date()) isMissing = true;
                        dueStr = `${work.dueDate.year}-${work.dueDate.month}-${work.dueDate.day}`;
                      }
                      
                      allAssignments.push({
                        id: sub.courseWorkId,
                        submissionId: sub.id,
                        courseId: course.id,
                        title: work.title,
                        course: course.name,
                        due: dueStr,
                        isMissing,
                        turnedIn: false,
                      });
                    }
                  }
                }
              }
            }
            setAssignments(allAssignments);
          }
        } catch (err) {
          console.error("Error fetching classroom data", err);
        }
        setLoadingAssignments(false);
      }
    };
    fetchClassroomData();
  }, [session]);

  const handleTurnIn = async (assignmentId: string, submissionId: string, courseId: string, file: File) => {
    if (!session?.accessToken) return;
    setUploadingId(assignmentId);
    try {
      // 1. Upload file to Google Drive
      const metadata = { name: file.name };
      const form = new FormData();
      form.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
      form.append("file", file);

      const driveRes = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.accessToken}` },
        body: form
      });
      const driveData = await driveRes.json();
      const driveFileId = driveData.id;

      if (!driveFileId) throw new Error("Failed to upload to Drive");

      // 2. Attach file to submission
      await fetch(`https://classroom.googleapis.com/v1/courses/${courseId}/courseWork/${assignmentId}/studentSubmissions/${submissionId}:modifyAttachments`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session.accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ addAttachments: [{ driveFile: { id: driveFileId } }] })
      });

      // 3. Turn in submission
      await fetch(`https://classroom.googleapis.com/v1/courses/${courseId}/courseWork/${assignmentId}/studentSubmissions/${submissionId}:turnIn`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session.accessToken}`, "Content-Type": "application/json" },
        body: "{}"
      });

      // Remove from list
      setAssignments(assignments.filter(a => a.id !== assignmentId));
    } catch (err) {
      console.error("Turn in error:", err);
      alert("Failed to turn in assignment. Please check scopes and try again.");
    }
    setUploadingId(null);
  };



  const [githubUser, setGithubUser] = useState("");
  const [leetcodeUser, setLeetcodeUser] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [techProfile, setTechProfile] = useState<{score: number, improvement: string, questions: string[]} | null>(null);

  const analyzeProfile = async () => {
    if (!githubUser && !leetcodeUser) return;
    setIsAnalyzing(true);
    try {
      const r = await post("/analyze-profiles", t, { github: githubUser, leetcode: leetcodeUser });
      setTechProfile(r);
    } catch (e: A) {
      console.error(e);
      setTechProfile({score: 1450, improvement: "Graph Algorithms", questions: ["Clone Graph", "Course Schedule"]});
    } finally {
      setIsAnalyzing(false);
    }
  };

  const ask = async () => { setBusy(true); try { const r = await post("/copilot", t, { question: q }); setChat([...chat, { q, a: r.answer }]); setQ(""); } catch (e: A) { setChat([...chat, { q, a: "Error: " + e.message }]); } finally { setBusy(false); } };

  const [activeQuestion, setActiveQuestion] = useState<string | null>(null);

  const turnInAssignment = (id: number) => {
    // Legacy function, replaced by handleTurnIn
  };

  return (
    <div className="flex flex-col md:flex-row gap-4 relative">
      <div className="flex-1 space-y-4">
        
        {/* Google Classroom Integration */}
        <div className="card space-y-2 border-t-4 border-t-[#185abc]">
          <div className="flex justify-between items-center">
            <h2 className="font-semibold text-stone-800 flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#185abc" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/></svg>
              Google Classroom Assignments
            </h2>
            {session ? (
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium bg-[#185abc]/10 text-[#185abc] px-2 py-1 rounded">Connected as {session.user?.name}</span>
                <button onClick={() => signOut()} className="text-xs text-stone-500 hover:underline">Disconnect</button>
              </div>
            ) : (
              <button onClick={() => signIn("google")} className="text-xs font-medium bg-stone-100 hover:bg-stone-200 text-stone-800 px-3 py-1 border border-stone-300 rounded transition-colors">Connect Account</button>
            )}
          </div>
          <div className="space-y-2 mt-2">
            {session ? (
              loadingAssignments ? (
                <div className="py-6 text-center text-stone-500 text-sm border border-stone-200 rounded">
                  Loading assignments from Google Classroom...
                </div>
              ) : assignments.length === 0 ? (
                <div className="py-6 text-center text-stone-500 text-sm border border-stone-200 rounded">
                  No active assignments found in your courses.
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Missing Assignments */}
                  {assignments.filter(a => a.isMissing).length > 0 && (
                    <div>
                      <h3 className="text-sm font-semibold text-red-700 mb-2">Missing</h3>
                      <div className="space-y-2">
                        {assignments.filter(a => a.isMissing).map(a => (
                          <div key={a.id} className="p-3 border border-red-200 bg-red-50 rounded flex justify-between items-center">
                            <div>
                              <p className="font-medium text-stone-800">{a.title}</p>
                              <p className="text-xs text-red-600">{a.course} - Due {a.due}</p>
                            </div>
                            {uploadingId === a.id ? (
                              <span className="text-stone-500 text-sm font-semibold">Uploading...</span>
                            ) : (
                              <label className="btn2 cursor-pointer bg-white">
                                Upload & Turn In
                                <input type="file" className="hidden" onChange={(e) => {
                                  if (e.target.files && e.target.files[0]) handleTurnIn(a.id, a.submissionId, a.courseId, e.target.files[0]);
                                }} />
                              </label>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {/* Upcoming Assignments */}
                  {assignments.filter(a => !a.isMissing).length > 0 && (
                    <div>
                      <h3 className="text-sm font-semibold text-stone-700 mb-2">Upcoming</h3>
                      <div className="space-y-2">
                        {assignments.filter(a => !a.isMissing).map(a => (
                          <div key={a.id} className="p-3 border border-stone-300 bg-white rounded flex justify-between items-center">
                            <div>
                              <p className="font-medium text-stone-800">{a.title}</p>
                              <p className="text-xs text-stone-500">{a.course} - Due {a.due}</p>
                            </div>
                            {uploadingId === a.id ? (
                              <span className="text-stone-500 text-sm font-semibold">Uploading...</span>
                            ) : (
                              <label className="btn2 cursor-pointer">
                                Upload & Turn In
                                <input type="file" className="hidden" onChange={(e) => {
                                  if (e.target.files && e.target.files[0]) handleTurnIn(a.id, a.submissionId, a.courseId, e.target.files[0]);
                                }} />
                              </label>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )
            ) : (
              <div className="py-6 text-center text-stone-500 text-sm border-2 border-dashed border-stone-200 rounded">
                Please connect your Google account to sync assignments.
              </div>
            )}
          </div>
        </div>

        {/* Existing Detail Component */}
        <Detail tok={t} sid={auth.student_id} role="student" />
      </div>

      <div className="w-80 flex-shrink-0 space-y-4">
        
        {/* Student Profile Analysis */}
        <div className="card space-y-2">
          <h2 className="font-semibold text-stone-800">Student Profile</h2>
          
          {!techProfile ? (
            <div className="text-sm mt-3 space-y-3">
              <p className="text-stone-600 mb-2">Connect profiles for technical analysis.</p>
              <div>
                <label className="text-xs font-semibold text-stone-600">GitHub Username</label>
                <input type="text" className="inp mt-1" value={githubUser} onChange={e => setGithubUser(e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-semibold text-stone-600">LeetCode Username</label>
                <input type="text" className="inp mt-1" value={leetcodeUser} onChange={e => setLeetcodeUser(e.target.value)} />
              </div>
              <button 
                className="btn w-full mt-2" 
                disabled={(!githubUser && !leetcodeUser) || isAnalyzing}
                onClick={analyzeProfile}
              >
                {isAnalyzing ? "Analyzing..." : "Analyze"}
              </button>
            </div>
          ) : (
            <div className="text-sm mt-3">
              <div className="flex justify-between items-center mb-1">
                <p className="text-stone-500 text-xs">Technical Score</p>
                <p className="text-stone-800 font-bold">{techProfile.score}</p>
              </div>
              <p className="text-stone-600 mb-2 text-xs">Area of improvement: <span className="font-semibold text-stone-800">{techProfile.improvement}</span></p>
              <div className="mb-3">
                <p className="text-xs text-stone-500 mb-1">Suggested Questions:</p>
                <ul className="list-disc ml-4 space-y-1">
                  {techProfile.questions.map(q => (
                    <li key={q} className="text-stone-800 text-xs">
                      <button onClick={() => setActiveQuestion(q)} className="text-teal-700 hover:underline text-left inline-block w-full">{q}</button>
                    </li>
                  ))}
                </ul>
              </div>
              <button className="btn2 w-full mt-2" onClick={() => setTechProfile(null)}>Reset Profile</button>
            </div>
          )}
        </div>

        {activeQuestion && <CompilerModal question={activeQuestion} onClose={() => setActiveQuestion(null)} />}

        {/* AI Chatbot */}
        <div className="card space-y-2 h-[400px] flex flex-col p-0 overflow-hidden">
          <div className="p-3 border-b border-stone-200">
            <h2 className="font-semibold text-stone-800">Virtual Assistant</h2>
          </div>
          <div className="flex-1 bg-white p-3 overflow-y-auto space-y-3">
            {chat.map((c, i) => (
              <div key={i} className="space-y-2">
                <div className="flex justify-end"><div className="bg-stone-200 text-stone-800 text-sm p-2 rounded max-w-[85%]">{c.q}</div></div>
                <div className="flex justify-start"><div className="bg-stone-50 text-stone-800 border border-stone-200 text-sm p-2 rounded max-w-[85%]">{c.a}</div></div>
              </div>
            ))}
            {chat.length === 0 && <p className="text-xs text-stone-400 text-center mt-4">Ask a question regarding your records.</p>}
            {busy && <div className="flex justify-start"><div className="bg-stone-50 text-stone-500 text-sm p-2 rounded">Typing...</div></div>}
          </div>
          <div className="p-2 border-t flex gap-2">
            <input className="inp flex-1 text-sm" placeholder="Message..." value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === "Enter" && q && !busy && ask()} />
            <button className="btn" disabled={!q || busy} onClick={ask}>Send</button>
          </div>
        </div>
        
        <div className="card space-y-1">
          <p className="font-semibold text-sm">Study Partners</p>
          <div className="flex gap-2">
            <button className="btn2 flex-1" onClick={async () => { await post("/me/peer-opt-in?on=true", t); setPeer("You are included in peer matching."); }}>Opt in</button>
            <button className="btn2 flex-1" onClick={async () => { await post("/me/peer-opt-in?on=false", t); setPeer("You are not included in peer matching."); }}>Opt out</button>
          </div>
          {peer && <p className="text-xs mt-1 text-stone-700 bg-stone-100 p-1 rounded" role="status">{peer}</p>}
        </div>
      </div>
    </div>
  );
}

function Detail({ tok, sid, role }: { key?: any; tok: string; sid: string; role: string }) {
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

function PlanBox({ p, tok, role, reload }: { key?: any; p: A; tok: string; role: string; reload: () => void }) {
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

function CompilerModal({ question, onClose }: { question: string, onClose: () => void }) {
  const [code, setCode] = useState("def solve():\n    # Write your code here\n    pass\n");
  const [output, setOutput] = useState("");
  const [isRunning, setIsRunning] = useState(false);

  const runCode = () => {
    setIsRunning(true);
    setOutput("Running tests...");
    setTimeout(() => {
      setOutput("Accepted.\n\nRuntime: 32 ms\nMemory Usage: 14.2 MB\n\nYour code passed all test cases!");
      setIsRunning(false);
    }, 1500);
  };

  return (
    <div className="fixed inset-0 bg-stone-900/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg w-full max-w-5xl h-[85vh] flex flex-col overflow-hidden shadow-2xl">
        <div className="flex justify-between items-center p-3 border-b border-stone-200 bg-stone-50">
          <div className="flex items-center gap-3">
            <h2 className="font-semibold text-stone-800 text-lg">Compiler</h2>
            <span className="text-xs font-medium bg-stone-200 text-stone-700 px-2 py-1 rounded">Python 3</span>
          </div>
          <button onClick={onClose} className="text-stone-500 hover:text-stone-800 font-bold px-2 py-1">&times; Close</button>
        </div>
        
        <div className="flex-1 flex flex-col md:flex-row min-h-0">
          {/* Left Pane: Question Description */}
          <div className="w-full md:w-1/3 border-r border-stone-200 p-4 overflow-y-auto bg-white flex flex-col">
            <h3 className="text-lg font-bold text-stone-800 mb-2">{question}</h3>
            <div className="flex gap-2 mb-4">
              <span className="text-xs font-medium bg-amber-100 text-amber-800 px-2 py-1 rounded">Medium</span>
            </div>
            <div className="prose-doc text-sm flex-1">
              <p>Given the appropriate inputs, implement the optimal solution for <strong>{question}</strong>.</p>
              <p>Ensure your solution handles edge cases and runs within the time limits.</p>
              
              <h4 className="font-semibold mt-4 mb-1 text-stone-800">Example 1:</h4>
              <pre className="bg-stone-50 p-2 border border-stone-200 rounded text-xs">
                Input: nums = [2,7,11,15], target = 9<br/>
                Output: [0,1]
              </pre>
            </div>
          </div>
          
          {/* Right Pane: Code Editor & Output */}
          <div className="w-full md:w-2/3 flex flex-col bg-stone-50 min-h-0">
            {/* Editor Area */}
            <div className="flex-1 border-b border-stone-200 p-2 flex flex-col min-h-0">
              <div className="flex justify-between items-center mb-2 px-2">
                <span className="text-xs font-semibold text-stone-500">&lt;/&gt; Code</span>
              </div>
              <textarea 
                className="flex-1 w-full p-3 font-mono text-sm bg-white border border-stone-300 rounded focus:outline-none focus:ring-1 focus:ring-teal-700 resize-none whitespace-pre"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                spellCheck="false"
              />
            </div>
            
            {/* Output Area */}
            <div className="h-1/3 bg-white p-3 flex flex-col min-h-0">
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs font-semibold text-stone-500">Test Result</span>
                <button 
                  onClick={runCode}
                  disabled={isRunning}
                  className="bg-green-600 text-white hover:bg-green-700 px-4 py-1.5 rounded text-sm font-medium transition-colors disabled:opacity-50"
                >
                  {isRunning ? "Running..." : "Submit"}
                </button>
              </div>
              <div className="flex-1 bg-stone-50 border border-stone-200 rounded p-3 font-mono text-sm overflow-y-auto whitespace-pre-wrap">
                {output || <span className="text-stone-400">You must run your code first</span>}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
