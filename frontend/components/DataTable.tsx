"use client";
import { useMemo, useState, ReactNode } from "react";

export type Col<T> = { key: string; label: string; get: (r: T) => string; render?: (r: T) => ReactNode };

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 bg-stone-900/50 flex items-start justify-center overflow-auto p-4 z-50" role="dialog" aria-modal="true" aria-label={title}>
      <div className={`bg-white rounded border border-stone-400 w-full ${wide ? "max-w-2xl" : "max-w-md"} mt-10 p-5`}>
        <div className="flex justify-between items-center mb-3"><h3 className="font-semibold">{title}</h3><button className="btns" onClick={onClose}>Close</button></div>
        {children}
      </div>
    </div>
  );
}

export function Field({ label, value, onChange, disabled, textarea, help }: { label: string; value: string; onChange: (v: string) => void; disabled?: boolean; textarea?: boolean; help?: string }) {
  return (
    <label className="block mb-3">
      <span className="lbl">{label}</span>
      {textarea ? <textarea className="inp h-28" value={value} onChange={e => onChange(e.target.value)} disabled={disabled} />
        : <input className="inp disabled:bg-stone-100" value={value} onChange={e => onChange(e.target.value)} disabled={disabled} />}
      {help && <span className="muted">{help}</span>}
    </label>
  );
}

type Props<T> = { cols: Col<T>[]; rows: T[]; onEdit?: (r: T) => void; onDelete?: (r: T) => void; actions?: (r: T) => ReactNode; pageSize?: number; emptyText?: string };

/** Table with a filter box under every column, sortable headers, paging, and optional edit/delete buttons. */
export function DataTable<T extends { id: number }>({ cols, rows, onEdit, onDelete, actions, pageSize = 25, emptyText = "No records." }: Props<T>) {
  const [f, setF] = useState<Record<string, string>>({});
  const [page, setPage] = useState(0);
  const [sort, setSort] = useState<{ k: string; dir: 1 | -1 } | null>(null);
  const allCols: Col<any>[] = useMemo(() => [{ key: "__sr", label: "Sr.No", get: (r: any) => r.__sr }, ...cols], [cols]);
  const data: any[] = useMemo(() => rows.map((r, i) => ({ ...r, __sr: String(i + 1) })), [rows]);
  const shown = useMemo(() => {
    let out = data.filter(r => allCols.every(c => { const q = (f[c.key] || "").trim().toLowerCase(); return !q || c.get(r).toLowerCase().includes(q); }));
    if (sort) { const c = allCols.find(x => x.key === sort.k); if (c) out = [...out].sort((a, b) => sort.dir * c.get(a).localeCompare(c.get(b), undefined, { numeric: true, sensitivity: "base" })); }
    return out;
  }, [data, f, sort, allCols]);
  const pages = Math.max(1, Math.ceil(shown.length / pageSize));
  const cur = Math.min(page, pages - 1);
  const slice = shown.slice(cur * pageSize, cur * pageSize + pageSize);
  const hasActions = !!(onEdit || onDelete || actions);
  const toggle = (k: string) => setSort(s => (s && s.k === k ? (s.dir === 1 ? { k, dir: -1 } : null) : { k, dir: 1 }));

  return (
    <div>
      <div className="overflow-x-auto border border-stone-300 rounded">
        <table className="w-full text-sm border-collapse">
          <thead className="bg-stone-100">
            <tr>
              {allCols.map(c => (
                <th key={c.key} className="text-left font-semibold px-2 py-2 whitespace-nowrap border-b border-stone-300">
                  <button className="hover:underline" onClick={() => toggle(c.key)} aria-label={`Sort by ${c.label}`}>{c.label}{sort?.k === c.key ? (sort.dir === 1 ? " (asc)" : " (desc)") : ""}</button>
                </th>))}
              {hasActions && <th className="px-2 py-2 text-left border-b border-stone-300">Actions</th>}
            </tr>
            <tr>
              {allCols.map(c => (
                <th key={c.key} className="px-2 py-1 border-b border-stone-300 font-normal">
                  <input className="inp !py-1 !text-xs min-w-[5rem]" placeholder="Filter" aria-label={`Filter ${c.label}`} value={f[c.key] || ""} onChange={e => { setF({ ...f, [c.key]: e.target.value }); setPage(0); }} />
                </th>))}
              {hasActions && <th className="border-b border-stone-300" />}
            </tr>
          </thead>
          <tbody>
            {slice.map(r => (
              <tr key={r.id} className="border-b border-stone-200 align-top hover:bg-stone-50">
                {allCols.map(c => <td key={c.key} className="px-2 py-1.5">{c.render ? c.render(r) : c.get(r)}</td>)}
                {hasActions && (
                  <td className="px-2 py-1.5 whitespace-nowrap space-x-1">
                    {actions && actions(r)}
                    {onEdit && <button className="btns" onClick={() => onEdit(r)}>Edit</button>}
                    {onDelete && <button className="btnd" onClick={() => onDelete(r)}>Delete</button>}
                  </td>)}
              </tr>))}
            {slice.length === 0 && <tr><td className="px-2 py-4 text-stone-600" colSpan={allCols.length + (hasActions ? 1 : 0)}>{rows.length ? "No rows match the filters." : emptyText}</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 mt-2 text-sm text-stone-700">
        <span>{shown.length === rows.length ? `${rows.length} rows` : `${shown.length} of ${rows.length} rows match`}</span>
        <span className="space-x-2">
          <button className="btns" disabled={cur === 0} onClick={() => setPage(cur - 1)}>Previous</button>
          <span>Page {cur + 1} of {pages}</span>
          <button className="btns" disabled={cur >= pages - 1} onClick={() => setPage(cur + 1)}>Next</button>
        </span>
      </div>
    </div>
  );
}
