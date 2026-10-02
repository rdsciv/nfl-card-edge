import test from 'node:test';
import assert from 'node:assert/strict';
import { parseGemrateCsv, parseSoldCsv, saleSummary, wilson, cohortStats, scenarioEconomics } from '../lib/market';

const populationCsv = '\uFEFF"","","Grading Details"\r\n"","Year","Set","Name","Parallel","Card #","Gems","Total","Gem Rate","Universal Pop","Recent Cert"\r\n"","2025","Panini, \"\"Donruss\"\"","Example Player","Silver","223","1,200","2,000","60%","https://www.gemrate.com/universal-search?gemrate_id=example","https://www.psacard.com/cert/123/psa"';

test('GemRate import preserves quoted identity and computes rate without certifying unknown denominator or date', () => {
  const imported = parseGemrateCsv(populationCsv);
  assert.equal(imported.errors.length, 0);
  assert.equal(imported.rows.length, 1);
  assert.equal(imported.rows[0].set, 'Panini, "Donruss"');
  assert.equal(imported.rows[0].id, 'example');
  assert.equal(imported.rows[0].gems, 1200);
  assert.equal(imported.rows[0].total, 2000);
  assert.equal(imported.rows[0].rate, .6);
  assert.equal(imported.rows[0].snapshotDate, null);
  assert.equal(imported.rows[0].denominatorVerified, false);
});

test('GemRate import accepts an explicit numeric-grade denominator and rejects impossible counts', () => {
  const imported = parseGemrateCsv('year,set,player,parallel,card_number,gems,numeric_grade_total,snapshot_date,source_url\n2023,Prizm,Example,Silver,1,6,10,2026-10-01,https://example.com/pop\n2023,Prizm,Other,Silver,2,11,10,2026-10-01,https://example.com/pop');
  assert.equal(imported.rows.length, 1);
  assert.equal(imported.rows[0].denominatorVerified, true);
  assert.equal(imported.rows[0].snapshotDate, '2026-10-01');
  assert.equal(imported.errors.length, 1);
});

test('Malformed CSV is reported and never returns partial evidence', () => {
  const imported = parseGemrateCsv('year,set,player,parallel,card_number,gems,total\n2023,"Prizm,Example,Silver,1,6,10');
  assert.equal(imported.rows.length, 0);
  assert.match(imported.errors.join(' '), /quote/i);
});

test('GemRate None provider IDs cannot merge different issues and missing source stays explicit', () => {
  const imported = parseGemrateCsv('Year,Set,Name,Parallel,Card #,Gems,Total,All PSA,Universal Pop,Recent Cert\n2025,Prizm,Example,Silver,1,3,10,https://example.com/search?gemRateId=silver,https://www.gemrate.com/universal-search?gemrate_id=None,\n2025,Prizm,Example,Base,1,2,10,https://example.com/search?gemRateId=base,https://www.gemrate.com/universal-search?gemrate_id=None,\n2025,Other Set,Example,Base,2,1,10,,,');
  assert.equal(imported.errors.length, 0);
  assert.equal(imported.rows.length, 3);
  assert.equal(imported.rows[0].id, 'silver');
  assert.equal(imported.rows[1].id, 'base');
  assert.equal(imported.rows[2].sourceUrl, '');
});

const saleHeader = 'source_id,source_url,sale_date,title,card_id,grader,grade,currency,item_price,shipping,quantity,verification,sale_format,status';
const saleLine = (id: string, price: number, overrides: string[] = []) => {
  const fields = [id, 'https://example.com/sale/' + id, '2026-10-01', '2023 Example Prizm Silver #1 PSA 10', 'card-1', 'PSA', '10', 'USD', String(price), '', '1', 'confirmed', 'auction', 'sold'];
  overrides.forEach((value, index) => { if (value !== undefined) fields[index] = value; });
  return fields.join(',');
};

test('Sold import excludes unknown offers, asks and lots without treating unknown shipping as free', () => {
  const imported = parseSoldCsv(saleHeader + '\n' + [
    saleLine('real', 100),
    saleLine('offer', 150).replace(',confirmed,auction,sold', ',unknown-offer,best_offer,sold'),
    saleLine('ask', 200).replace(',auction,sold', ',fixed_price,active'),
    saleLine('lot', 300).replace(',,1,confirmed', ',,2,confirmed'),
    saleLine('real', 100),
  ].join('\n'));
  assert.equal(imported.rows.length, 1);
  assert.equal(imported.rows[0].shipping, null);
  assert.equal(imported.errors.length, 4);
});

test('Sold import validates calendar dates and retains card grade separately from autograph grade', () => {
  const valid = parseSoldCsv(saleHeader + ',autograph_grade\n' + saleLine('card-grade', 100) + ',9');
  assert.equal(valid.rows[0].grade, '10');
  assert.equal(valid.rows[0].autographGrade, '9');
  const invalid = parseSoldCsv(saleHeader + '\n' + saleLine('invalid', -3).replace('2026-10-01', '2026-02-30'));
  assert.equal(invalid.rows.length, 0);
  assert.ok(invalid.errors.length > 0);
});

test('Sold import preserves the printed designation, scale era, certificate and sale format', () => {
  const imported = parseSoldCsv(saleHeader + ',grade_label,scale_era,cert_number\n' + saleLine('label', 100).replace(',PSA,10,', ',CGC,10,') + ',Gem Mint,Current,12345');
  assert.equal(imported.errors.length, 0);
  assert.equal(imported.rows[0].designation, 'Gem Mint');
  assert.equal(imported.rows[0].scaleEra, 'Current');
  assert.equal(imported.rows[0].certNumber, '12345');
  assert.equal(imported.rows[0].saleFormat, 'auction');
});

test('Sold summaries use exact card and grade, dedupe IDs and require five recent comps', () => {
  const imported = parseSoldCsv(saleHeader + '\n' + [10, 20, 30, 40, 100].map((price, i) => saleLine(String(i), price)).join('\n'));
  const duplicate = { ...imported.rows[0], itemPrice: 900 };
  const otherCard = { ...imported.rows[0], sourceId: 'other', cardId: 'base-card' };
  const future = { ...imported.rows[0], sourceId: 'future', saleDate: '2026-10-03', itemPrice: 900 };
  const summary = saleSummary([...imported.rows, duplicate, otherCard, future], 'card-1', 'PSA', '10', 30, new Date('2026-10-02T12:00:00Z'));
  assert.equal(summary.median, 30);
  assert.equal(summary.count, 5);
  assert.equal(summary.min, 10);
  assert.equal(summary.max, 100);
  assert.equal(summary.shippingMedian, null);
  assert.equal(summary.actionable, true);
  assert.equal(saleSummary(imported.rows.slice(0, 4), 'card-1', 'PSA', '10', 30, new Date('2026-10-02')).actionable, false);
});

test('Sold summaries do not blend currencies and calculate inclusive medians only with known shipping', () => {
  const imported = parseSoldCsv(saleHeader + '\n' + saleLine('usd', 100).replace(',,1,', ',5,1,') + '\n' + saleLine('usd2', 150));
  const summary = saleSummary(imported.rows, 'card-1', 'PSA', '10', 30, new Date('2026-10-02'));
  assert.equal(summary.shippingMedian, 105);
  assert.equal(summary.shippingCount, 1);
  const mixed = saleSummary([...imported.rows, { ...imported.rows[0], sourceId: 'eur', currency: 'EUR' }], 'card-1', 'PSA', '10', 30, new Date('2026-10-02'));
  assert.equal(mixed.median, null);
  assert.equal(mixed.actionable, false);
  assert.deepEqual(mixed.currencies, ['EUR', 'USD']);
});

test('CGC numeric 10 buckets never pool Gem Mint with Pristine prices', () => {
  const imported = parseSoldCsv(saleHeader + ',designation\n' + [100, 200, 300, 400, 500].map((price, index) => saleLine('label-' + index, price).replace(',PSA,10,', ',CGC,10,') + ',' + (index < 2 ? 'Gem Mint' : 'Pristine')).join('\n'));
  const summary = saleSummary(imported.rows, 'card-1', 'CGC', '10', 30, new Date('2026-10-02'));
  assert.equal(summary.count, 5);
  assert.equal(summary.eligible, false);
  assert.equal(summary.actionable, false);
  assert.equal(summary.median, null);
  assert.equal(summary.shippingMedian, null);
  assert.equal(summary.labelCoverage.known, 5);
  assert.deepEqual(summary.labelCoverage.designations, ['Gem Mint', 'Pristine']);
  assert.match(summary.labelIssue!, /designation/i);
});

test('Exact requested designation selects its own prices and excludes unknown or other labels', () => {
  const imported = parseSoldCsv(saleHeader + ',designation\n' + [10, 20, 30, 40, 100].map((price, index) => saleLine('gem-' + index, price).replace(',PSA,10,', ',CGC,10,') + ',Gem Mint').join('\n') + '\n' + saleLine('pristine', 900).replace(',PSA,10,', ',CGC,10,') + ',Pristine\n' + saleLine('unknown', 800).replace(',PSA,10,', ',CGC,10,') + ',');
  const summary = saleSummary(imported.rows, 'card-1', 'CGC', '10', 30, new Date('2026-10-02'), 5, ' gem   mint ');
  assert.equal(summary.count, 5);
  assert.equal(summary.eligible, true);
  assert.equal(summary.actionable, true);
  assert.equal(summary.median, 30);
  assert.equal(summary.labelCoverage.unknown, 0);
});

test('Unknown labels and mixed scale eras remain in individual comps without producing ambiguous grader medians', () => {
  const unknown = parseSoldCsv(saleHeader + '\n' + saleLine('unknown-cgc', 100).replace(',PSA,10,', ',CGC,10,'));
  const thin = saleSummary(unknown.rows, 'card-1', 'CGC', '10', 30, new Date('2026-10-02'), 1);
  assert.equal(thin.median, null);
  assert.equal(thin.eligible, false);
  assert.equal(thin.labelCoverage.unknown, 1);
  assert.equal(thin.recentSale?.sourceId, 'unknown-cgc');
  const eras = parseSoldCsv(saleHeader + ',designation,scale_era\n' + saleLine('old', 100).replace(',PSA,10,', ',BGS,10,') + ',Pristine,Legacy\n' + saleLine('new', 200).replace(',PSA,10,', ',BGS,10,') + ',Pristine,Current');
  const mixed = saleSummary(eras.rows, 'card-1', 'BGS', '10', 30, new Date('2026-10-02'), 1);
  assert.equal(mixed.median, null);
  assert.equal(mixed.actionable, false);
  assert.match(mixed.labelIssue!, /scale/i);
});

test('Wilson interval exposes small-sample uncertainty and rejects impossible inputs', () => {
  const interval = wilson(8, 10);
  assert.ok(interval);
  assert.ok(interval.low > .49 && interval.low < .5);
  assert.ok(interval.high > .94 && interval.high < .95);
  assert.equal(wilson(0, 0), null);
  assert.throws(() => wilson(11, 10), /success|count/i);
});

test('Cohorts use first eligible completed attempt per physical card and separate methods/pending', () => {
  const attempts = [
    { id: '1', physicalCardId: 'a', cardId: 'card-1', method: 'in-holder', success: false, completedAt: '2026-09-01' },
    { id: '2', physicalCardId: 'a', cardId: 'card-1', method: 'in-holder', success: true, completedAt: '2026-09-10' },
    { id: '3', physicalCardId: 'b', cardId: 'card-1', method: 'in-holder', success: true, completedAt: '2026-09-11' },
    { id: '4', physicalCardId: 'c', cardId: 'card-1', method: 'in-holder', success: null, completedAt: null },
    { id: '5', physicalCardId: 'd', cardId: 'card-1', method: 'crack-and-submit', success: true, completedAt: '2026-09-11' },
    { id: '6', physicalCardId: 'e', cardId: 'other-card', method: 'in-holder', success: true, completedAt: '2026-09-11' },
  ];
  const cohort = cohortStats([...attempts, attempts[0]], 'in-holder', 'card-1');
  assert.equal(cohort.attempts, 4);
  assert.equal(cohort.uniqueCards, 3);
  assert.equal(cohort.completed, 2);
  assert.equal(cohort.successes, 1);
  assert.equal(cohort.pending, 1);
  assert.equal(cohort.rate, .5);
  assert.equal(cohort.exploratory, true);
});

const costs = { successProbability: .6, exitSuccess: 250, exitFailure: 100, entry: 100, inboundShipping: 5, taxRate: .1, buyerFees: 2, gradingFee: 20, gradingShipping: 10, packaging: 3, sellingFeeRate: .1, sellingFixed: 1, outboundShipping: 5, successExtra: 10, failureExtra: 2, targetRoi: .2, maxLoss: 50 };

test('Economics charge common and outcome fees once and solve entry from ROI plus loss constraints', () => {
  const economics = scenarioEconomics(costs);
  assert.equal(economics.commonCost, 150);
  assert.equal(economics.netSuccess, 219);
  assert.equal(economics.netFailure, 84);
  assert.ok(economics.roi !== null && economics.breakEvenProbability !== null && economics.maximumEntry !== null);
  assert.ok(Math.abs(economics.expectedProfit - 8.2) < 1e-9);
  assert.ok(Math.abs(economics.roi - 8.2 / 156.8) < 1e-9);
  assert.ok(Math.abs(economics.breakEvenProbability - 68 / 127) < 1e-9);
  assert.equal(economics.worstCash, 160);
  assert.ok(Math.abs(economics.maximumEntry - 82.45454545454545) < 1e-9);
});

test('Economics distinguish unreachable thresholds and reject invalid probabilities', () => {
  const impossible = scenarioEconomics({ ...costs, exitSuccess: 20, exitFailure: 10 });
  assert.ok(impossible.breakEvenProbability !== null);
  assert.ok(impossible.breakEvenProbability > 1);
  assert.equal(impossible.breakEvenStatus, 'unreachable');
  assert.equal(impossible.maximumEntry, null);
  const inverted = scenarioEconomics({ ...costs, exitSuccess: 70, exitFailure: 200 });
  assert.equal(inverted.breakEvenProbability, null);
  assert.equal(inverted.breakEvenStatus, 'success-not-better');
  assert.throws(() => scenarioEconomics({ ...costs, successProbability: 1.01 }), /probability/i);
});
