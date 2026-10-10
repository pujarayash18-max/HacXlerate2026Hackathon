"use client";
import { useState } from "react";
import { API, A, call } from "../lib/api";

export function Login({ onLogin }: { onLogin: (a: A) => void }) {
  const [mode, setMode] = useState<"in" | "forgot">("in");
  const [u, setU] = useState(""); const [p, setP] = useState(""); const [err, setErr] = useState(""); const [info, setInfo] = useState(""); const [busy, setBusy] = useState(false);
  const signIn = async () => {
    setErr(""); setBusy(true);
    try {
      const r = await fetch(API + "/auth/login", { method: "POST", body: new URLSearchParams({ username: u.trim(), password: p }) });
      const j = await r.json().catch(() => ({}));
      r.ok ? onLogin(j) : setErr(typeof j.detail === "string" ? j.detail : "Sign in failed");
    } catch { setErr("Cannot reach the server."); } finally { setBusy(false); }
  };
  const forgot = async () => {
    setErr(""); setBusy(true);
    try {
      const r = await fetch(API + "/auth/forgot", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: u.trim() }) });
      const j = await r.json(); setInfo(j.message || "Request sent.");
    } catch { setErr("Cannot reach the server."); } finally { setBusy(false); }
  };
  return (
    <main className="max-w-sm mx-auto mt-20 px-4">
      <div className="card space-y-3">
        <h1 className="text-xl font-bold">Student Success Platform</h1>
        <p className="muted">{mode === "in" ? "Sign in with your employee ID or enrollment number." : "Enter your ID. The administrator will verify you and give you a temporary password."}</p>
        <label className="block"><span className="lbl">ID</span><input className="inp" autoComplete="username" value={u} onChange={e => setU(e.target.value)} /></label>
        {mode === "in" && <label className="block"><span className="lbl">Password</span><input className="inp" type="password" autoComplete="current-password" value={p} onChange={e => setP(e.target.value)} onKeyDown={e => e.key === "Enter" && u && p && signIn()} /></label>}
        {err && <p className="err" role="alert">{err}</p>}
        {info && <p className="text-sm" role="status">{info}</p>}
        {mode === "in"
          ? <button className="btn w-full" disabled={busy || !u || !p} onClick={signIn}>Sign in</button>
          : <button className="btn w-full" disabled={busy || !u || !!info} onClick={forgot}>Send request</button>}
        <button className="text-sm underline" onClick={() => { setMode(mode === "in" ? "forgot" : "in"); setErr(""); setInfo(""); }}>{mode === "in" ? "Forgot password" : "Back to sign in"}</button>
      </div>
    </main>
  );
}

export function ChangePassword({ auth, onDone, onCancel }: { auth: A; onDone: () => void; onCancel: () => void }) {
  const [o, setO] = useState(""); const [n, setN] = useState(""); const [n2, setN2] = useState(""); const [err, setErr] = useState("");
  const go = async () => {
    setErr("");
    if (n !== n2) { setErr("The new passwords do not match"); return; }
    try { await call("/auth/change-password", auth.access_token, { method: "POST", body: JSON.stringify({ old_password: o, new_password: n }) }); onDone(); }
    catch (e: A) { setErr(e.message); }
  };
  return (
    <main className="max-w-sm mx-auto mt-20 px-4">
      <div className="card space-y-3">
        <h1 className="text-xl font-bold">Choose a new password</h1>
        <p className="muted">Your current password is temporary. Choose your own before continuing. Use at least 8 characters.</p>
        <label className="block"><span className="lbl">Temporary password</span><input className="inp" type="password" autoComplete="current-password" value={o} onChange={e => setO(e.target.value)} /></label>
        <label className="block"><span className="lbl">New password</span><input className="inp" type="password" autoComplete="new-password" value={n} onChange={e => setN(e.target.value)} /></label>
        <label className="block"><span className="lbl">Repeat new password</span><input className="inp" type="password" autoComplete="new-password" value={n2} onChange={e => setN2(e.target.value)} /></label>
        {err && <p className="err" role="alert">{err}</p>}
        <div className="flex gap-2"><button className="btn" disabled={!o || !n} onClick={go}>Save password</button><button className="btn2" onClick={onCancel}>Sign out</button></div>
      </div>
    </main>
  );
}
