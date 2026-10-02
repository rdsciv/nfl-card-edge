'use client';
import { useState } from 'react';
import { CheckCircle2, Download, Github, Upload } from 'lucide-react';
import { parseGemrateCsv, parseSoldCsv, type Population, type SoldSale } from '@/lib/market';
import type { NFLData, Preferences } from '@/lib/types';
import { backupKeys, readBackup } from '@/lib/backup';
import { date, Empty, exportPrivateBackup, Notice, percent, Source } from './shared';

type Props = {
  data: NFLData; populations: Population[]; setPopulations: (rows: Population[]) => void;
  sales: SoldSale[]; setSales: (rows: SoldSale[]) => void;
  preferences: Preferences; setPreferences: (p: Preferences) => void;
};
export default function SettingsView({ data, populations, setPopulations, sales, setSales, preferences, setPreferences }: Props) {
  const [kind, setKind] = useState('population');
  const [preview, setPreview] = useState<{ rows: Population[] | SoldSale[]; errors: string[] } | null>(null);
  const [message, setMessage] = useState('');
  const [fileName, setFileName] = useState('');
  const [filter, setFilter] = useState('');
  async function read(file: File | undefined) {
    setMessage(''); if (!file) return;
    if (file.size > 10 * 1024 * 1024) { setMessage('Use a CSV smaller than 10 MB.'); return; }
    try { const text = await file.text(); setPreview(kind === 'population' ? parseGemrateCsv(text) : parseSoldCsv(text)); setFileName(file.name); } catch { setMessage('The CSV could not be read.'); }
  }
  function commit() {
    if (!preview?.rows.length) return;
    if (kind === 'population') setPopulations([...new Map([...populations, ...preview.rows as Population[]].map(r => [r.id, r])).values()]);
    else setSales([...new Map([...sales, ...preview.rows as SoldSale[]].map(r => [r.sourceId, r])).values()]);
    setPreview(null); setMessage('Import saved in this browser.');
  }
  async function restore(file: File | undefined) {
    if (!file) return;
    try {
      const { records } = readBackup(await file.text());
      const previous = Object.fromEntries(backupKeys.map(key => [key, localStorage.getItem(key)]));
      try { for (const key of backupKeys) localStorage.setItem(key, JSON.stringify(records[key])); }
      catch (e) { for (const key of backupKeys) localStorage.removeItem(key); for (const key of backupKeys) if (previous[key] !== null) localStorage.setItem(key, previous[key]!); throw e; }
      location.reload();
    } catch (e) { setMessage(e instanceof Error ? e.message : 'Backup restore failed.'); }
  }
  function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); const f = new FormData(e.currentTarget); const next = { budget: Number(f.get('budget')), horizon: Number(f.get('horizon')), risk: String(f.get('risk')), maxLoss: Number(f.get('maxLoss')), targetRoi: Number(f.get('targetRoi')) / 100, exposure: Number(f.get('exposure')) / 100, willingToGrade: String(f.get('willingToGrade')) };
    setPreferences(next); setMessage('Investor settings saved in this browser.');
  }
  const populationRows = populations.filter(p => `${p.player} ${p.set} ${p.parallel} ${p.cardNumber}`.toLowerCase().replace(/prism/g, 'prizm').includes(filter.toLowerCase().replace(/prism/g, 'prizm')));
  return <>
    <div className="page-heading compact"><div><div className="eyebrow">MAKE THE ASSUMPTIONS VISIBLE</div><h1>Settings & data</h1><p>Your data, preferences, and source coverage in one place.</p></div><span className="pill green"><Github size={13} /> GITHUB PAGES + ACTIONS</span></div>
    <Notice>Private inputs are saved on this device only. The public site has no account server. Never enter API tokens here; keep provider secrets in GitHub Actions secrets if an authorized adapter is added.</Notice>
    {message && <div className="success-notice" role="status"><CheckCircle2 size={17} />{message}</div>}
    <section className="panel padded"><div className="panel-heading"><div><h2>Move your private workspace</h2><p>Export here, restore on another computer. A restore replaces this browser’s private records.</p></div><button className="outline-btn" onClick={exportPrivateBackup}>Export private backup</button></div><label>Restore private JSON backup<input type="file" accept=".json,application/json" onChange={e => restore(e.target.files?.[0])} /></label></section>
    <section className="panel padded"><div className="panel-heading"><div><h2>Manual imports</h2><p><span>{populations.length} population records</span> · <span>{sales.length} sold records</span> · browser only</p></div><Upload size={20} /></div><div className="form-grid import-form"><label>Import type<select value={kind} onChange={e => { setKind(e.target.value); setPreview(null); setMessage(''); }}><option value="population">PSA population / GemRate export</option><option value="sold">Realized sold comps</option></select></label><label>CSV file<input type="file" accept=".csv,text/csv" onChange={e => read(e.target.files?.[0])} /></label><a className="outline-btn" href={`${process.env.NEXT_PUBLIC_BASE_PATH || ''}/templates/${kind === 'population' ? 'population' : 'sold-comps'}.csv`} download><Download size={15} /> Download CSV template</a></div><p className="muted">GemRate exports with two header rows are supported. Unknown snapshot dates and unverified denominators stay labeled. Comps require exact card IDs, source links, and known sale amounts. Imports are manual and never refresh automatically.</p>
      {preview && <div className="import-preview"><h3>{preview.rows.length} valid records</h3><p>{fileName} · {preview.errors.length} validation messages</p>{preview.errors.length > 0 && <details open><summary>Review validation issues (rejected rows are excluded)</summary><ul className="errors">{preview.errors.slice(0, 20).map((e, i) => <li key={i}>{e}</li>)}</ul>{preview.errors.length > 20 && <p>{preview.errors.length - 20} more messages</p>}</details>}<pre>{JSON.stringify(preview.rows.slice(0, 3), null, 2)}</pre><button className="primary-btn" disabled={!preview.rows.length} onClick={commit}>Commit import</button><button className="outline-btn" onClick={() => setPreview(null)}>Cancel preview</button></div>}
      {populations.length > 0 && <><div className="table-tools"><input aria-label="Search imported population" placeholder="Search imported player, Prizm, parallel, or card #" value={filter} onChange={e => setFilter(e.target.value)} /><span>{populationRows.length} matches</span></div><div className="table-scroll"><table><thead><tr><th>EXACT ISSUE</th><th>PSA 10 / TOTAL</th><th>REPORTED GEM RATE</th><th>SNAPSHOT</th><th>SOURCE</th></tr></thead><tbody>{populationRows.slice(0, 50).map(p => <tr key={p.id}><td><b>{p.player}</b><small className="cell-small">{p.year} {p.set} · {p.parallel} · #{p.cardNumber}</small></td><td>{p.gems.toLocaleString()} / {p.total.toLocaleString()}</td><td>{percent(p.rate)}<small className="cell-small">{p.denominatorVerified ? 'Numeric denominator supplied' : 'Denominator unverified'}</small></td><td>{p.snapshotDate || 'Unknown'}</td><td>{p.sourceUrl ? <Source url={p.sourceUrl}>Population report</Source> : 'Not supplied'}</td></tr>)}</tbody></table></div>{populationRows.length > 50 && <p className="muted">Showing the first 50 matching records. Narrow the search to inspect an exact issue.</p>}</>}
    </section>
    <section className="panel padded"><div className="panel-heading"><div><h2>Investor preferences</h2><p>All fields are required before personalized position sizes are eligible.</p></div><span className="pill">PAPER TRADING</span></div><form className="form-grid" onSubmit={save}><label>Total budget (USD)<input name="budget" type="number" min="1" required defaultValue={preferences.budget ?? ''} /></label><label>Holding period (days)<input name="horizon" type="number" min="1" required defaultValue={preferences.horizon ?? ''} /></label><label>Risk tolerance<select name="risk" required defaultValue={preferences.risk}><option value="">Choose…</option><option>Low</option><option>Moderate</option><option>High</option></select></label><label>Maximum acceptable loss (USD)<input name="maxLoss" type="number" min="0" required defaultValue={preferences.maxLoss ?? ''} /></label><label>Minimum return (%)<input name="targetRoi" type="number" min="0" step="0.1" required defaultValue={preferences.targetRoi == null ? '' : preferences.targetRoi * 100} /></label><label>Maximum per-player exposure (%)<input name="exposure" type="number" min="1" max="100" required defaultValue={preferences.exposure == null ? '' : preferences.exposure * 100} /></label><label>Willingness to grade<select name="willingToGrade" required defaultValue={preferences.willingToGrade}><option value="">Choose…</option><option value="no">No grading</option><option value="in-holder">In-holder crossover only</option><option value="raw">Raw-first or in-holder</option></select></label><div className="form-action"><button className="primary-btn" type="submit">Save preferences</button></div></form></section>
    <section className="panel padded"><div className="panel-heading"><div><h2>Data health & cloud execution</h2><p>Last snapshot: {date(data.updatedAt)}. Incomplete inputs are not silently replaced with zero.</p></div><Source url="https://github.com/rdsciv/nfl-card-edge/actions">Open cloud jobs / Run now</Source></div><div className="provider-grid">{[
      ['nflverse football', data.status, 'Published schedule, identities, weekly stats. See field coverage below.'],
      ['Sold card prices', sales.length ? 'Manual import' : 'Blocked', 'No authorized automatic sold feed. Browse is active listings only.'],
      ['PSA populations', populations.length ? 'Manual import' : 'Unconfigured', 'Official API exists; token entitlement and exact SpecID are untested.'],
      ['Cert / active asks', 'Unconfigured', 'No authentication or API adapter connected. Manual verification required.'],
      ['Grading outcomes', 'Manual evidence', 'Separate physical cards, attempts, and methods. No grade conversion assumptions.'],
      ['Private cloud database', 'Unavailable on Pages', 'Private records are browser storage; no PostgreSQL service or cloud sync.'],
    ].map(([name, status, text]) => <div key={name}><h3>{name}</h3><span className={`pill ${status === 'live' ? 'green' : 'amber'}`}>{status}</span><p>{text}</p></div>)}</div><details className="details"><summary>Coverage and scoring methodology</summary><p>Rankings compare position-specific opportunity volume and weighted team target shares with prior available completed games. Missing route data is excluded. Touchdowns do not create the usage signal. The worker publishes component values and weights with the snapshot; neutral scores with no sample do not establish a role change.</p><pre>{JSON.stringify({ methodology: data.methodology, coverage: data.coverage, providers: data.providers }, null, 2)}</pre><Source url="https://github.com/rdsciv/nfl-card-edge/blob/main/worker/pipeline.py">Read exact scoring and missing-data rules</Source></details><div className="schedule-box"><b>America/Chicago</b><span>Next actual due run: {date(data.nextRun?.at)} · {data.nextRun?.kind || "unavailable"}</span><span>Tuesday 9:15 AM · weekly report</span><span>Friday 4:15 PM · correction revision</span><span>Saturday · delayed-data catch-up</span></div><details className="details"><summary>Actual cloud job records</summary>{data.jobs.length ? <pre>{JSON.stringify(data.jobs.slice(-10), null, 2)}</pre> : <Empty title="No stored job record" text="The first cloud execution will write its actual result." />}</details></section>
  </>;
}
