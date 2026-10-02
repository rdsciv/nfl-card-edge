'use client';
import { useEffect, useState } from 'react';
import { ExternalLink, Info } from 'lucide-react';
import type { Metrics } from '@/lib/types';
import { emptyPreferences } from '@/lib/types';
import { backupKeys } from '@/lib/backup';

export function useStored<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(initial);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => { try { const raw = localStorage.getItem(key); if (raw) setValue(JSON.parse(raw)); } catch { /* Keep usable default if storage is unavailable. */ } setLoaded(true); }, [key]);
  useEffect(() => { if (loaded) try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* Browser may disable persistence. */ } }, [key, value, loaded]);
  return [value, setValue] as const;
}
export const money = (n: number | null | undefined) => n == null || !Number.isFinite(n) ? '—' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
export const number = (n: number | null | undefined, digits = 1) => n == null || !Number.isFinite(n) ? '—' : n.toFixed(digits);
export const percent = (n: number | null | undefined) => n == null || !Number.isFinite(n) ? '—' : `${(n * 100).toFixed(1)}%`;
export const date = (s: string | null | undefined) => s ? new Date(s).toLocaleString('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) + ' CT' : 'Not available';
export function Source({ url, children = 'Source' }: { url: string; children?: React.ReactNode }) {
  if (!/^https?:\/\//i.test(url)) return <span>Source unavailable</span>;
  return <a href={url} target="_blank" rel="noreferrer" className="source">{children}<ExternalLink size={12} /></a>;
}
export function Notice({ children }: { children: React.ReactNode }) { return <div className="notice"><Info size={17} /><div>{children}</div></div>; }
export function Empty({ title, text, action }: { title: string; text: string; action?: React.ReactNode }) {
  return <div className="empty"><div className="empty-glyph">—</div><h3>{title}</h3><p>{text}</p>{action}</div>;
}
export function download(name: string, value: unknown) {
  const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' })); link.download = name; link.click(); URL.revokeObjectURL(link.href);
}
export function exportPrivateBackup() {
  const records = Object.fromEntries(backupKeys.map(key => [key, JSON.parse(localStorage.getItem(key) || JSON.stringify(key === 'nce-preferences' ? emptyPreferences : []))]));
  download('nfl-card-edge-private-backup.json', { version: 1, records });
}
export function UsageChart({ history, field }: { history: Metrics[]; field: 'targets' | 'carries' | 'attempts' }) {
  const recent = history.slice(-6); const values = recent.map(x => x[field] ?? 0); const max = Math.max(1, ...values);
  if (!recent.length) return <Empty title="Usage unavailable" text="The source has not published a supported weekly sample." />;
  return <div className="usage-bars" role="img" aria-label={recent.map(x => `Week ${x.week}: ${x[field] ?? 'unknown'} ${field}`).join('; ')}>{recent.map((x, i) => <div className="bar-column" key={`${x.week}-${i}`}><b>{x[field] ?? '—'}</b><div className={`bar ${i === recent.length - 1 ? 'latest' : ''}`} style={{ height: `${Math.max(3, values[i] / max * 110)}px` }} /><span>W{x.week}</span></div>)}</div>;
}
