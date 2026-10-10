export const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
export type A = any;

export async function call(path: string, tok: string, opts: RequestInit = {}) {
  const form = opts.body instanceof FormData;
  const r = await fetch(API + path, { ...opts, headers: { Authorization: `Bearer ${tok}`, ...(form || !opts.body ? {} : { "Content-Type": "application/json" }) } });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401 && tok) { sessionStorage.removeItem("auth"); location.reload(); }
  if (!r.ok) throw new Error(typeof j.detail === "string" ? j.detail : j.detail ? JSON.stringify(j.detail) : r.statusText);
  return j;
}
const send = (method: string) => (p: string, t: string, body?: A) => call(p, t, { method, body: body === undefined ? undefined : JSON.stringify(body) });
export const post = send("POST");
export const put = send("PUT");
export const del = send("DELETE");
export const pct = (v: number | null | undefined) => (v == null ? "n/a" : Math.round(v * 100) + "%");
