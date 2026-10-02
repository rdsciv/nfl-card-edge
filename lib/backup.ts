export const backupKeys = ['nce-watchlist', 'nce-owned', 'nce-preferences', 'nce-populations', 'nce-sales', 'nce-reviews', 'nce-attempts'] as const;

function requireValue(valid: boolean, path: string, description: string): void {
  if (!valid) throw new Error(`${path}: ${description}.`);
}

function object(value: unknown, path: string): Record<string, unknown> {
  requireValue(typeof value === 'object' && value !== null && !Array.isArray(value), path, 'must be an object');
  return value as Record<string, unknown>;
}

function strings(value: Record<string, unknown>, fields: string[], path: string): void {
  for (const field of fields) requireValue(typeof value[field] === 'string', `${path}.${field}`, 'must be text');
}

function numeric(value: unknown, path: string, minimum = 0, maximum = Infinity, nullable = false, integer = false): void {
  if (value === null && nullable) return;
  requireValue(typeof value === 'number' && Number.isFinite(value) && value >= minimum && value <= maximum && (!integer || Number.isSafeInteger(value)), path, `must be ${nullable ? 'null or ' : ''}a finite ${integer ? 'whole ' : ''}number at least ${minimum}${maximum === Infinity ? '' : ` and at most ${maximum}`}`);
}

function boolean(value: unknown, path: string, nullable = false): void {
  requireValue(typeof value === 'boolean' || (nullable && value === null), path, `must be ${nullable ? 'null or ' : ''}true/false`);
}

function date(value: unknown, path: string, nullable = false, allowEmpty = false, timestamp = false): void {
  if ((nullable && value === null) || (allowEmpty && value === '')) return;
  requireValue(typeof value === 'string', path, 'must be a date');
  const text = value as string;
  const parsed = new Date(text);
  const calendar = /^\d{4}-\d{2}-\d{2}$/.test(text) && !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === text;
  requireValue(timestamp ? /^\d{4}-\d{2}-\d{2}T/.test(text) && !Number.isNaN(parsed.valueOf()) : calendar, path, `must be a valid ${timestamp ? 'ISO timestamp' : 'YYYY-MM-DD date'}`);
}

function url(value: unknown, path: string, allowEmpty = false): void {
  if (allowEmpty && value === '') return;
  try {
    if (typeof value !== 'string' || !['https:', 'http:'].includes(new URL(value).protocol)) throw new Error();
  } catch { throw new Error(`${path}: must be an http(s) URL${allowEmpty ? ' or empty when unknown' : ''}.`); }
}

function rowArray(value: unknown, path: string, validate: (row: Record<string, unknown>, path: string) => void): void {
  requireValue(Array.isArray(value), path, 'must be an array');
  (value as unknown[]).forEach((row, index) => validate(object(row, `${path}[${index}]`), `${path}[${index}]`));
}

export function readBackup(text: string): { records: Record<string, unknown> } {
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { throw new Error('Backup is not valid JSON.'); }
  const envelope = object(parsed, 'Backup');
  requireValue(envelope.version === 1, 'Backup version', 'only version 1 is supported');
  for (const key of Object.keys(envelope)) requireValue(['version', 'records'].includes(key), 'Backup format', `unsupported field ${key}`);
  const records = object(envelope.records, 'Backup records');
  for (const key of Object.keys(records)) requireValue((backupKeys as readonly string[]).includes(key), 'Backup records', `unsupported storage key ${key}`);
  for (const key of backupKeys) requireValue(Object.hasOwn(records, key), key, 'is required in a complete backup');

  const watchlist = records['nce-watchlist'];
  requireValue(Array.isArray(watchlist) && watchlist.every(value => typeof value === 'string' && value.trim().length > 0), 'nce-watchlist', 'must be an array of player names');
  rowArray(records['nce-owned'], 'nce-owned', (row, path) => {
    strings(row, ['id', 'player', 'card', 'grade', 'status'], path);
    numeric(row.cost, `${path}.cost`);
    numeric(row.proceeds, `${path}.proceeds`, 0, Infinity, true);
  });
  const preferences = object(records['nce-preferences'], 'nce-preferences');
  strings(preferences, ['risk', 'willingToGrade'], 'nce-preferences');
  for (const field of ['budget', 'horizon', 'maxLoss', 'targetRoi']) numeric(preferences[field], `nce-preferences.${field}`, 0, Infinity, true, field === 'horizon');
  numeric(preferences.exposure, 'nce-preferences.exposure', 0, 1, true);
  rowArray(records['nce-populations'], 'nce-populations', (row, path) => {
    strings(row, ['id', 'year', 'set', 'player', 'parallel', 'cardNumber'], path);
    numeric(row.gems, `${path}.gems`, 0, Infinity, false, true);
    numeric(row.total, `${path}.total`, 1, Infinity, false, true);
    requireValue((row.gems as number) <= (row.total as number), `${path}.gems`, 'cannot exceed total population');
    numeric(row.rate, `${path}.rate`, 0, 1);
    requireValue(Math.abs((row.rate as number) - (row.gems as number) / (row.total as number)) < 1e-9, `${path}.rate`, 'must equal gems / total');
    boolean(row.denominatorVerified, `${path}.denominatorVerified`);
    date(row.snapshotDate, `${path}.snapshotDate`, true);
    url(row.sourceUrl, `${path}.sourceUrl`, true);
    url(row.certUrl, `${path}.certUrl`, true);
  });
  rowArray(records['nce-sales'], 'nce-sales', (row, path) => {
    strings(row, ['sourceId', 'title', 'cardId', 'grader', 'grade', 'currency'], path);
    strings(row, ['designation', 'scaleEra', 'certNumber', 'saleFormat', 'autographGrade'].filter(field => Object.hasOwn(row, field)), path);
    url(row.sourceUrl, `${path}.sourceUrl`);
    date(row.saleDate, `${path}.saleDate`);
    numeric(row.itemPrice, `${path}.itemPrice`);
    requireValue((row.itemPrice as number) > 0, `${path}.itemPrice`, 'must be greater than zero');
    numeric(row.shipping, `${path}.shipping`, 0, Infinity, true);
    requireValue(row.quantity === 1, `${path}.quantity`, 'only individual card sales are comparable');
    requireValue(['confirmed', 'user-reported'].includes(row.verification as string), `${path}.verification`, 'must be confirmed or user-reported');
  });
  rowArray(records['nce-reviews'], 'nce-reviews', (row, path) => {
    strings(row, ['id', 'issue', 'grader', 'grade', 'designation', 'cert', 'concerns', 'imageAssessment', 'ocrText'], path);
    const subgrades = object(row.subgrades, `${path}.subgrades`);
    requireValue(Object.values(subgrades).every(value => typeof value === 'string'), `${path}.subgrades`, 'must contain text values');
    boolean(row.verified, `${path}.verified`);
    date(row.recordedAt, `${path}.recordedAt`, false, false, true);
    url(row.listing, `${path}.listing`, true);
  });
  rowArray(records['nce-attempts'], 'nce-attempts', (row, path) => {
    strings(row, ['id', 'physicalCardId', 'cardId', 'method', 'originalGrade', 'finalOutcome', 'minimumGrade', 'notes', 'verification'], path);
    requireValue(['in-holder', 'crack-and-submit', 'raw-first'].includes(row.method as string), `${path}.method`, 'must use a supported submission method');
    boolean(row.success, `${path}.success`, true);
    // Empty completion dates remain explicit unknown dates from manual entry.
    date(row.completedAt, `${path}.completedAt`, true, true);
    url(row.evidenceUrl, `${path}.evidenceUrl`);
  });
  return { records };
}
