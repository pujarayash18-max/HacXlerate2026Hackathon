"use client";
import { useEffect, useState } from "react";
import { A } from "../lib/api";
import { Login, ChangePassword } from "../components/Auth";
import { FacultyPanel, ClassPanel, StudentPanel, ResetPanel } from "../components/Panels";
import { AdminAnalytics } from "../components/AdminAnalytics";
import { Staff, StudentHome } from "../components/Dashboards";

const TABS = [["faculty", "Faculty"], ["classes", "Class assignment"], ["students", "Students"], ["resets", "Password requests"], ["analytics", "Analytics and accounts"]];

export default function Home() {
  const [auth, setAuth] = useState<A>(null);
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState("faculty");
  useEffect(() => { const s = sessionStorage.getItem("auth"); if (s) setAuth(JSON.parse(s)); setReady(true); }, []);
  const save = (a: A) => { a ? sessionStorage.setItem("auth", JSON.stringify(a)) : sessionStorage.removeItem("auth"); setAuth(a); };
  if (!ready) return null;
  if (!auth) return <Login onLogin={save} />;
  if (auth.must_change) return <ChangePassword auth={auth} onDone={() => save({ ...auth, must_change: false })} onCancel={() => save(null)} />;
  const t = auth.access_token;
  return (
    <main className="max-w-7xl mx-auto p-4 space-y-4">
      <header className="flex flex-wrap justify-between items-center gap-2">
        <h1 className="text-xl font-bold">Student Success Platform <span className="text-sm font-normal text-stone-600">{auth.role}, {auth.name}</span></h1>
        <button className="btn2" onClick={() => save(null)}>Sign out</button>
      </header>
      {auth.role === "admin" ? (<>
        <nav className="flex flex-wrap gap-1 border-b border-stone-300" aria-label="Admin sections">
          {TABS.map(([k, l]) => <button key={k} onClick={() => setTab(k)} aria-current={tab === k ? "page" : undefined}
            className={`px-3 py-2 text-sm border border-b-0 rounded-t ${tab === k ? "bg-white border-stone-300 font-semibold -mb-px" : "border-transparent text-stone-700 hover:bg-stone-100"}`}>{l}</button>)}
        </nav>
        {tab === "faculty" && <FacultyPanel tok={t} />}
        {tab === "classes" && <ClassPanel tok={t} />}
        {tab === "students" && <StudentPanel tok={t} />}
        {tab === "resets" && <ResetPanel tok={t} />}
        {tab === "analytics" && <AdminAnalytics tok={t} />}
      </>) : auth.role === "student" ? <StudentHome auth={auth} /> : <Staff auth={auth} />}
    </main>
  );
}
