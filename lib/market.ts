export type Population = {
  id: string; year: string; set: string; player: string; parallel: string; cardNumber: string;
  gems: number; total: number; rate: number; sourceUrl: string; certUrl: string;
  snapshotDate: string | null; denominatorVerified: boolean;
};

export type SoldSale = {
  sourceId: string; sourceUrl: string; saleDate: string; title: string; cardId: string;
  grader: string; grade: string; currency: string; itemPrice: number; shipping: number | null;
  quantity: number; verification: 'confirmed' | 'user-reported';
  designation?: string; scaleEra?: string; certNumber?: string; saleFormat?: string; autographGrade?: string;
};

export type CohortAttempt = {
  id: string; physicalCardId: string; cardId: string; method: string;
  success: boolean | null; completedAt: string | null;
};

export type ScenarioInput = {
  successProbability: number; exitSuccess: number; exitFailure: number; entry: number;
  inboundShipping: number; taxRate: number; buyerFees: number; gradingFee: number;
  gradingShipping: number; packaging: number; sellingFeeRate: number; sellingFixed: number;
  outboundShipping: number; successExtra: number; failureExtra: number; targetRoi: number; maxLoss: number;
};

type ImportResult<T> = { rows: T[]; errors: string[] };
const headerKey = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]/g, '');

// RFC 4180 quoting, including escaped quotes, embedded commas and line breaks.
function csvRecords(text: string): string[][] {
  text = text.replace(/^\uFEFF/, '');
  const records: string[][] = [];
  let record: string[] = [], field = '', quoted = false, closed = false;
  const finishField = () => { record.push(field); field = ''; closed = false; };
  const finishRecord = () => {
    finishField();
    if (record.some(value => value.trim())) records.push(record);
    record = [];
  };
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (quoted) {
      if (char !== '"') field += char;
      else if (text[index + 1] === '"') { field += '"'; index++; }
      else { quoted = false; closed = true; }
    } else if (char === ',') finishField();
    else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[index + 1] === '\n') index++;
      finishRecord();
    } else if (closed) {
      if (char !== ' ' && char !== '\t') throw new Error('Unexpected text after a closing CSV quote.');
    } else if (char === '"') {
      if (field) throw new Error('Unexpected quote in an unquoted CSV field.');
      quoted = true;
    } else field += char;
  }
  if (quoted) throw new Error('Unclosed CSV quote.');
  if (field || record.length || closed) finishRecord();
  return records;
}

function table(text: string, required: string[]): { records: string[][]; get: (row: string[], ...keys: string[]) => string; header: string[]; offset: number } {
  const records = csvRecords(text);
  const offset = records.findIndex(row => required.every(key => row.map(headerKey).includes(key)));
  if (offset < 0) throw new Error(`Missing CSV header: ${required.join(', ')}.`);
  const header = records[offset].map(headerKey);
  const named = header.filter(Boolean);
  if (new Set(named).size !== named.length) throw new Error('Duplicate CSV column names are ambiguous.');
  return {
    records: records.slice(offset + 1), header, offset,
    get: (row, ...keys) => {
      const column = keys.map(key => header.indexOf(key)).find(index => index >= 0);
      return column === undefined ? '' : (row[column] ?? '').trim();
    },
  };
}

function numberField(value: string, name: string, integer = false): number {
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(value)) throw new Error(`${name} must be a nonnegative number.`);
  const number = Number(value.replaceAll(',', ''));
  if (!Number.isFinite(number) || (integer && !Number.isSafeInteger(number))) throw new Error(`${name} must be ${integer ? 'a safe integer' : 'finite'}.`);
  return number;
}

function dateField(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Date must use YYYY-MM-DD.');
  const parsed = new Date(value + 'T00:00:00Z');
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== value) throw new Error('Invalid calendar date.');
  return value;
}

function urlField(value: string): string {
  try {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol)) throw new Error();
    return value;
  } catch { throw new Error('Source URL must be an http(s) URL.'); }
}

export function parseGemrateCsv(text: string): ImportResult<Population> {
  const rows: Population[] = [], errors: string[] = [];
  try {
    const data = table(text, ['year', 'set', 'gems']);
    const seen = new Set<string>();
    data.records.forEach((row, index) => {
      try {
        if (row.length !== data.header.length) throw new Error('Column count does not match header.');
        const year = data.get(row, 'year'), set = data.get(row, 'set'), player = data.get(row, 'name', 'player');
        const parallel = data.get(row, 'parallel'), cardNumber = data.get(row, 'card', 'cardnumber');
        if (!/^\d{4}$/.test(year) || !set || !player || !parallel || !cardNumber) throw new Error('Exact year, set, player, parallel and card number are required.');
        const gems = numberField(data.get(row, 'gems'), 'Gems', true);
        const denominatorVerified = data.header.includes('numericgradetotal');
        const total = numberField(data.get(row, 'numericgradetotal', 'total'), 'Total', true);
        if (total <= 0 || gems > total) throw new Error('Population must have total > 0 and gems <= total.');
        const universalText = data.get(row, 'universalpop', 'sourceurl');
        const salesText = data.get(row, 'allpsa');
        const universal = universalText ? new URL(urlField(universalText)) : null;
        const sales = salesText ? new URL(urlField(salesText)) : null;
        const usableId = (value: string | null | undefined) => value && !/^(?:none|null|undefined)$/i.test(value) ? value : '';
        const universalId = usableId(universal?.searchParams.get('gemrate_id') || universal?.searchParams.get('gemRateId'));
        const salesId = usableId(sales?.searchParams.get('gemRateId'));
        const invalidUniversalId = universal?.searchParams.has('gemrate_id') && !universalId;
        const sourceUrl = invalidUniversalId ? salesText : universalText || salesText;
        const cert = data.get(row, 'recentcert', 'certurl');
        const certUrl = cert ? urlField(cert) : '';
        const date = data.get(row, 'snapshotdate');
        const snapshotDate = date ? dateField(date) : null;
        const id = data.get(row, 'cardid', 'id') || universalId || salesId || JSON.stringify([year, set, player, parallel, cardNumber].map(value => value.toLowerCase()));
        if (seen.has(id)) throw new Error('Duplicate population card identity.');
        seen.add(id);
        rows.push({ id, year, set, player, parallel, cardNumber, gems, total, rate: gems / total, sourceUrl, certUrl, snapshotDate, denominatorVerified });
      } catch (error) { errors.push(`Row ${data.offset + index + 2}: ${(error as Error).message}`); }
    });
  } catch (error) { errors.push((error as Error).message); }
  return { rows, errors };
}

export function parseSoldCsv(text: string): ImportResult<SoldSale> {
  const rows: SoldSale[] = [], errors: string[] = [];
  try {
    const data = table(text, ['sourceid', 'sourceurl', 'saledate', 'title', 'cardid', 'grader', 'grade', 'currency', 'itemprice', 'shipping', 'quantity', 'verification']);
    const seen = new Set<string>();
    data.records.forEach((row, index) => {
      try {
        if (row.length !== data.header.length) throw new Error('Column count does not match header.');
        const sourceId = data.get(row, 'sourceid'), title = data.get(row, 'title'), cardId = data.get(row, 'cardid');
        if (!sourceId || !title || !cardId) throw new Error('Source ID, title and exact card ID are required.');
        const verification = data.get(row, 'verification').toLowerCase().replaceAll('_', '-');
        if (verification !== 'confirmed' && verification !== 'user-reported') throw new Error('Exclude unverified prices and unknown accepted offers; use confirmed or user-reported.');
        const status = data.get(row, 'status').toLowerCase();
        if (status && status !== 'sold') throw new Error('Asks, bids and active listings are not sold comps.');
        const format = data.get(row, 'saleformat').toLowerCase();
        if (['ask', 'asking', 'bid', 'active', 'unknownoffer', 'unknown_offer'].includes(format)) throw new Error('Asks, bids and unknown offers are not sold comps.');
        const quantity = numberField(data.get(row, 'quantity'), 'Quantity', true);
        if (quantity !== 1 || /\b(?:lot of|reprint|replica)\b/i.test(title)) throw new Error('Lots and reprints are excluded from exact-card comps.');
        const grader = data.get(row, 'grader').toUpperCase();
        if (!['RAW', 'PSA', 'SGC', 'BGS', 'CGC', 'CSG'].includes(grader)) throw new Error('Unsupported grader.');
        let grade = data.get(row, 'grade').toUpperCase();
        if (grader === 'RAW') {
          if (!['RAW', 'UNGRADED', ''].includes(grade)) throw new Error('Raw cards must use RAW or ungraded card grade.');
          grade = 'RAW';
        } else if (!/^(?:[1-9](?:\.5)?|10)$/.test(grade)) throw new Error('Numeric card grade must be 1–10; autograph grades do not establish card grade.');
        const currency = data.get(row, 'currency').toUpperCase();
        if (!/^[A-Z]{3}$/.test(currency)) throw new Error('Currency must use a three-letter code.');
        const itemPrice = numberField(data.get(row, 'itemprice'), 'Item price');
        if (itemPrice <= 0) throw new Error('Sold item price must be greater than zero.');
        const shippingText = data.get(row, 'shipping');
        const shipping = shippingText ? numberField(shippingText, 'Shipping') : null;
        const sourceUrl = urlField(data.get(row, 'sourceurl')), saleDate = dateField(data.get(row, 'saledate'));
        if (seen.has(sourceId)) throw new Error('Duplicate source ID excluded.');
        seen.add(sourceId);
        const designation = data.get(row, 'designation') || data.get(row, 'gradelabel');
        const scaleEra = data.get(row, 'scaleera'), certNumber = data.get(row, 'certnumber');
        const autographGrade = data.get(row, 'autographgrade');
        rows.push({ sourceId, sourceUrl, saleDate, title, cardId, grader, grade, currency, itemPrice, shipping, quantity, verification,
          ...(designation ? { designation } : {}), ...(scaleEra ? { scaleEra } : {}),
          ...(certNumber ? { certNumber } : {}), ...(format ? { saleFormat: format } : {}),
          ...(autographGrade ? { autographGrade } : {}) });
      } catch (error) { errors.push(`Row ${data.offset + index + 2}: ${(error as Error).message}`); }
    });
  } catch (error) { errors.push((error as Error).message); }
  return { rows, errors };
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b), middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function saleSummary(sales: SoldSale[], cardId: string, grader: string, grade: string, days: number, now = new Date(), minimumCount = 5, designation?: string) {
  if (!Number.isFinite(days) || days <= 0 || !Number.isInteger(minimumCount) || minimumCount < 1 || Number.isNaN(now.valueOf())) throw new Error('Valid window, date and minimum comp count required.');
  const cutoff = now.valueOf() - days * 86400000, seen = new Set<string>();
  const labelKey = (value: string) => value.trim().toLowerCase().replace(/\s+/g, ' ');
  const requestedDesignation = labelKey(designation || '');
  const matches = sales.filter(sale => {
    const time = Date.parse(sale.saleDate + 'T00:00:00Z');
    if (sale.cardId !== cardId || sale.grader.toUpperCase() !== grader.toUpperCase() || sale.grade.toUpperCase() !== grade.toUpperCase() || sale.quantity !== 1 || !['confirmed', 'user-reported'].includes(sale.verification) || !Number.isFinite(time) || time < cutoff || time > now.valueOf() || seen.has(sale.sourceId)) return false;
    if (requestedDesignation && labelKey(sale.designation || '') !== requestedDesignation) return false;
    seen.add(sale.sourceId);
    return true;
  });
  const currencies = [...new Set(matches.map(sale => sale.currency))].sort();
  const labels = new Map<string, string>(), eras = new Map<string, string>();
  for (const sale of matches) {
    if (sale.designation?.trim()) labels.set(labelKey(sale.designation), sale.designation.trim());
    if (sale.scaleEra?.trim()) eras.set(labelKey(sale.scaleEra), sale.scaleEra.trim());
  }
  const known = matches.filter(sale => sale.designation?.trim()).length;
  const labelCoverage = { known, unknown: matches.length - known, designations: [...labels.values()].sort(), scaleEras: [...eras.values()].sort() };
  const ambiguousGrader = ['CGC', 'BGS', 'CSG'].includes(grader.toUpperCase());
  const labelIssue = ambiguousGrader && matches.length && !requestedDesignation
    ? labelCoverage.unknown ? 'Label designation is unknown for some comps; numeric grade alone is insufficient.'
      : labels.size > 1 ? 'Multiple label designations share this numeric grade; select an exact designation.'
      : eras.size > 1 ? 'Multiple scale eras are present; select an exact designation before estimating.'
      : null
    : null;
  const comparable = currencies.length <= 1 && labelIssue === null;
  const prices = comparable ? matches.map(sale => sale.itemPrice) : [];
  const inclusive = comparable ? matches.filter(sale => sale.shipping !== null).map(sale => sale.itemPrice + sale.shipping!) : [];
  const recentSale = [...matches].sort((a, b) => b.saleDate.localeCompare(a.saleDate))[0] ?? null;
  return { median: median(prices), count: matches.length, min: prices.length ? Math.min(...prices) : null, max: prices.length ? Math.max(...prices) : null, shippingMedian: median(inclusive), shippingCount: inclusive.length, recentSale, eligible: comparable, actionable: comparable && matches.length >= minimumCount, currencies, currency: currencies.length === 1 ? currencies[0] : null, labelCoverage, labelIssue };
}

export function wilson(success: number, total: number): { low: number; high: number } | null {
  if (!Number.isSafeInteger(success) || !Number.isSafeInteger(total) || success < 0 || total < 0 || success > total) throw new Error('Success count must be an integer between zero and total.');
  if (!total) return null;
  const z = 1.959963984540054, rate = success / total, denominator = 1 + z * z / total;
  const center = (rate + z * z / (2 * total)) / denominator;
  const margin = z * Math.sqrt(rate * (1 - rate) / total + z * z / (4 * total * total)) / denominator;
  return { low: Math.max(0, center - margin), high: Math.min(1, center + margin) };
}

export function cohortStats(attempts: CohortAttempt[], method: string, cardId: string) {
  const seen = new Set<string>();
  const matched = attempts.filter(attempt => {
    if (attempt.method !== method || attempt.cardId !== cardId || !attempt.physicalCardId || seen.has(attempt.id)) return false;
    seen.add(attempt.id);
    return true;
  });
  const completed = matched.filter(attempt => typeof attempt.success === 'boolean' && attempt.completedAt !== null && Number.isFinite(Date.parse(attempt.completedAt))).sort((a, b) => a.completedAt!.localeCompare(b.completedAt!) || a.id.localeCompare(b.id));
  const first = new Map<string, CohortAttempt>();
  completed.forEach(attempt => { if (!first.has(attempt.physicalCardId)) first.set(attempt.physicalCardId, attempt); });
  const independent = [...first.values()], successes = independent.filter(attempt => attempt.success).length;
  return { attempts: matched.length, uniqueCards: new Set(matched.map(attempt => attempt.physicalCardId)).size, completed: independent.length, successes, pending: matched.length - completed.length, rate: independent.length ? successes / independent.length : null, interval: wilson(successes, independent.length), exploratory: independent.length < 30, repeatAttempts: completed.length - independent.length, firstDate: independent[0]?.completedAt ?? null, lastDate: independent.at(-1)?.completedAt ?? null };
}

// Tax is applied to entry item price. Buyer fees are dollars. Selling percentage
// applies to exit item price; fixed fee and outbound postage are charged once.
export function scenarioEconomics(input: ScenarioInput) {
  for (const [key, value] of Object.entries(input)) {
    if (!Number.isFinite(value) || value < 0) throw new Error(`${key} must be finite and nonnegative.`);
  }
  if (input.successProbability > 1) throw new Error('Success probability must be between zero and one.');
  if (input.sellingFeeRate > 1 || input.taxRate > 1) throw new Error('Fee and tax rates must be between zero and one.');
  const p = input.successProbability;
  const fixedCost = input.inboundShipping + input.buyerFees + input.gradingFee + input.gradingShipping + input.packaging;
  const commonCost = input.entry * (1 + input.taxRate) + fixedCost;
  const netSuccess = input.exitSuccess * (1 - input.sellingFeeRate) - input.sellingFixed - input.outboundShipping;
  const netFailure = input.exitFailure * (1 - input.sellingFeeRate) - input.sellingFixed - input.outboundShipping;
  const successReturn = netSuccess - input.successExtra, failureReturn = netFailure - input.failureExtra;
  const expectedExtra = p * input.successExtra + (1 - p) * input.failureExtra;
  const expectedOutlay = commonCost + expectedExtra;
  const expectedNet = p * netSuccess + (1 - p) * netFailure;
  const expectedProfit = expectedNet - expectedOutlay;
  const gap = successReturn - failureReturn;
  const breakEvenProbability = gap > 0 ? (commonCost - failureReturn) / gap : null;
  const breakEvenStatus = gap <= 0 ? 'success-not-better' : breakEvenProbability! > 1 ? 'unreachable' : breakEvenProbability! <= 0 ? 'already-profitable' : 'conditional';
  const returnEntry = (expectedNet / (1 + input.targetRoi) - expectedExtra - fixedCost) / (1 + input.taxRate);
  const lossEntry = (Math.min(successReturn, failureReturn) + input.maxLoss - fixedCost) / (1 + input.taxRate);
  const limit = Math.min(returnEntry, lossEntry);
  const maximumEntry = limit >= 0 ? limit : null;
  return { commonCost, expectedProfit, roi: expectedOutlay > 0 ? expectedProfit / expectedOutlay : null, breakEvenProbability, breakEvenStatus, maximumEntry, worstCash: commonCost + Math.max(input.successExtra, input.failureExtra), netSuccess, netFailure, expectedOutlay, worstProfit: Math.min(successReturn, failureReturn) - commonCost, returnEntry, lossEntry };
}
