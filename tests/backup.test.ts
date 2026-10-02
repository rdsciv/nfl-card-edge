import test from 'node:test';
import assert from 'node:assert/strict';
import { readBackup } from '../lib/backup';

const preferences = { budget: null, horizon: null, risk: '', maxLoss: null, targetRoi: null, exposure: null, willingToGrade: '' };
const population = { id: 'card-1', year: '2023', set: 'Panini Prizm', player: 'Example', parallel: 'Silver', cardNumber: '303', gems: 6, total: 10, rate: .6, sourceUrl: '', certUrl: '', snapshotDate: null, denominatorVerified: false };
const sale = { sourceId: 'sale-1', sourceUrl: 'https://example.com/sale', saleDate: '2026-10-01', title: 'Example Prizm Silver', cardId: 'card-1', grader: 'PSA', grade: '10', currency: 'USD', itemPrice: 100, shipping: null, quantity: 1, verification: 'confirmed' };
const review = { id: 'review-1', issue: 'card-1', grader: 'SGC', grade: '9.5', designation: 'MINT+', cert: '', subgrades: { surface: '' }, concerns: '', imageAssessment: 'Insufficient images', listing: '', verified: false, recordedAt: '2026-10-02T12:00:00Z', ocrText: '' };
const attempt = { id: 'attempt-1', physicalCardId: 'physical-1', cardId: 'card-1', method: 'in-holder', success: null, completedAt: null, originalGrade: 'SGC 9.5', finalOutcome: 'pending', evidenceUrl: 'https://example.com/evidence', minimumGrade: 'PSA 10', notes: '', verification: 'user-reported' };
const records = () => ({
  'nce-watchlist': ['Example Player'],
  'nce-owned': [{ id: 'owned-1', player: 'Example Player', card: '2023 Prizm Silver #303', grade: 'PSA 10', cost: 100, proceeds: null, status: 'Owned' }],
  'nce-preferences': { ...preferences },
  'nce-populations': [{ ...population }],
  'nce-sales': [{ ...sale }],
  'nce-reviews': [{ ...review }],
  'nce-attempts': [{ ...attempt }],
});
const encode = (record = records()) => JSON.stringify({ version: 1, records: record });

test('Backup restores all seven private stores including unknown shipping and pending outcomes', () => {
  const restored = readBackup(encode());
  assert.deepEqual(restored.records, records());
});

test('Backup rejects incomplete, mixed, or newer formats before providing records', () => {
  assert.throws(() => readBackup('{oops'), /JSON/i);
  assert.throws(() => readBackup(JSON.stringify({ version: 2, records: records() })), /version/i);
  assert.throws(() => readBackup(JSON.stringify({ version: '1', records: records() })), /version/i);
  assert.throws(() => readBackup(JSON.stringify({ version: 1, data: records() })), /records|format|unsupported/i);
  assert.throws(() => readBackup(JSON.stringify({ version: 1, records: records(), data: records() })), /unsupported|format/i);
  const incomplete = records() as Record<string, unknown>;
  delete incomplete['nce-sales'];
  assert.throws(() => readBackup(JSON.stringify({ version: 1, records: incomplete })), /nce-sales/);
});

test('Backup rejects unsupported storage keys and non-array stores', () => {
  assert.throws(() => readBackup(JSON.stringify({ version: 1, records: { ...records(), 'nce-token': 'secret' } })), /nce-token|unsupported/i);
  for (const key of ['nce-watchlist', 'nce-owned', 'nce-populations', 'nce-sales', 'nce-reviews', 'nce-attempts']) {
    const invalid: Record<string, unknown> = records();
    invalid[key] = null;
    assert.throws(() => readBackup(JSON.stringify({ version: 1, records: invalid })), new RegExp(key));
  }
});

test('Backup catches nested fields that would crash watchlist, portfolio, and settings views', () => {
  const invalidWatchlist: Record<string, unknown> = records();
  invalidWatchlist['nce-watchlist'] = [{ name: 'Not a string' }];
  assert.throws(() => readBackup(JSON.stringify({ version: 1, records: invalidWatchlist })), /nce-watchlist/);
  const invalidOwned = records();
  invalidOwned['nce-owned'][0].cost = -1;
  assert.throws(() => readBackup(encode(invalidOwned)), /cost/);
  const invalidPreferences: Record<string, unknown> = records();
  invalidPreferences['nce-preferences'] = { ...preferences, exposure: 1.1 };
  assert.throws(() => readBackup(JSON.stringify({ version: 1, records: invalidPreferences })), /exposure/);
  invalidPreferences['nce-preferences'] = { ...preferences, budget: '100' };
  assert.throws(() => readBackup(JSON.stringify({ version: 1, records: invalidPreferences })), /budget/);
});

test('Backup validates population arithmetic and sale provenance without changing unknown values', () => {
  const invalidPopulation = records();
  invalidPopulation['nce-populations'][0].rate = .7;
  assert.throws(() => readBackup(encode(invalidPopulation)), /rate/);
  invalidPopulation['nce-populations'][0] = { ...population, gems: 11 };
  assert.throws(() => readBackup(encode(invalidPopulation)), /gems|population/i);
  const invalidSales = records();
  invalidSales['nce-sales'][0].sourceUrl = 'javascript:alert(1)';
  assert.throws(() => readBackup(encode(invalidSales)), /sourceUrl/);
  invalidSales['nce-sales'][0] = { ...sale, saleDate: '2026-02-30' };
  assert.throws(() => readBackup(encode(invalidSales)), /saleDate/);
});

test('Backup validates manual review subgrades and separates physical-card attempt identities', () => {
  const invalidReview: Record<string, unknown> = records();
  invalidReview['nce-reviews'] = [{ ...review, subgrades: { surface: { grade: 9.5 } } }];
  assert.throws(() => readBackup(JSON.stringify({ version: 1, records: invalidReview })), /subgrades/);
  const invalidAttempt: Record<string, unknown> = records();
  invalidAttempt['nce-attempts'] = [{ ...attempt, physicalCardId: 123 }];
  assert.throws(() => readBackup(JSON.stringify({ version: 1, records: invalidAttempt })), /physicalCardId/);
  invalidAttempt['nce-attempts'] = [{ ...attempt, success: 'false' }];
  assert.throws(() => readBackup(JSON.stringify({ version: 1, records: invalidAttempt })), /success/);
});

test('Backup preserves optional sale label evidence while rejecting malformed label objects', () => {
  const withLabels: Record<string, unknown> = records();
  withLabels['nce-sales'] = [{ ...sale, designation: 'Gem Mint', scaleEra: 'Current', certNumber: '12345', saleFormat: 'auction', autographGrade: '9' }];
  const restored = readBackup(JSON.stringify({ version: 1, records: withLabels }));
  assert.deepEqual(restored.records['nce-sales'], withLabels['nce-sales']);
  for (const field of ['designation', 'scaleEra', 'certNumber', 'saleFormat', 'autographGrade']) {
    const malformed: Record<string, unknown> = records();
    malformed['nce-sales'] = [{ ...sale, [field]: { label: 'not text' } }];
    assert.throws(() => readBackup(JSON.stringify({ version: 1, records: malformed })), new RegExp(field));
  }
});
