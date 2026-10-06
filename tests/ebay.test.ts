import test from 'node:test';
import assert from 'node:assert/strict';
import { ebaySearchUrl, listingTotal, listingState, type Listing } from '../lib/ebay';
import type { Card } from '../lib/types';

const card: Card = {
  id: 'wilson-silver', playerId: null, player: 'Michael Wilson', year: 2023,
  manufacturer: 'Panini', set: 'Prizm', cardNumber: '318', parallel: 'Silver',
  rookie: true, verified: true, sourceUrl: '', verifiedAt: '',
};
const listing: Listing = {
  id: '123', cardId: card.id, title: '2023 Michael Wilson Prizm Silver PSA 10',
  grader: 'PSA', grade: '10', format: 'buy-now', itemPrice: 30.99,
  shipping: 4.99, currency: 'USD', url: 'https://www.ebay.com/itm/123',
  seller: 'example', checkedAt: '2026-10-06T18:00:00Z',
};

test('Exact-card searches preserve issue identity and exclude commonly mismatched candidates', () => {
  const url = new URL(ebaySearchUrl('Michael Wilson', card, 'ALL', 'buy-now'));
  assert.equal(url.origin + url.pathname, 'https://www.ebay.com/sch/i.html');
  const query = url.searchParams.get('_nkw')!;
  for (const identity of ['2023', 'Panini', 'Michael Wilson', 'Prizm', 'Silver', '318']) assert.ok(query.includes(identity));
  for (const exclusion of ['-autograph', '-auto', '-variation', '-lot', '-reprint', '-"no huddle"']) assert.ok(query.includes(exclusion));
  assert.equal(url.searchParams.get('_sacat'), '261328');
  assert.equal(url.searchParams.get('LH_BIN'), '1');
  assert.equal(url.searchParams.get('LH_Auction'), null);
  assert.equal(url.searchParams.get('_sop'), '15');
});

test('PSA 9 and PSA 10 queries use separate grade phrases without broadening the card', () => {
  const psa9 = new URL(ebaySearchUrl('Michael Wilson', card, 'PSA 9', 'auction')).searchParams.get('_nkw')!;
  const psa10 = new URL(ebaySearchUrl('Michael Wilson', card, 'PSA 10', 'auction')).searchParams.get('_nkw')!;
  assert.ok(psa9.includes('"PSA 9"'));
  assert.ok(!psa9.includes('"PSA 10"'));
  assert.ok(psa10.includes('"PSA 10"'));
  assert.ok(!psa10.includes('"PSA 9"'));
  for (const bucket of ['SGC 9.5', 'BGS 9.5', 'CGC 10']) {
    assert.ok(new URL(ebaySearchUrl('Michael Wilson', card, bucket, 'buy-now')).searchParams.get('_nkw')!.includes('"' + bucket + '"'));
  }
});

test('Raw searches exclude graders while all-grade searches retain them', () => {
  const raw = new URL(ebaySearchUrl('Michael Wilson', card, 'RAW', 'buy-now')).searchParams.get('_nkw')!;
  const all = new URL(ebaySearchUrl('Michael Wilson', card, 'ALL', 'buy-now')).searchParams.get('_nkw')!;
  for (const exclusion of ['-PSA', '-SGC', '-BGS', '-CGC', '-CSG', '-graded']) {
    assert.ok(raw.includes(exclusion));
    assert.ok(!all.includes(exclusion));
  }
});

test('Player-level searches stay usable before an exact card is selected', () => {
  const query = new URL(ebaySearchUrl('Tyler Shough', undefined, 'ALL', 'buy-now')).searchParams.get('_nkw')!;
  assert.ok(query.startsWith('Tyler Shough Prizm Silver rookie'));
});

test('Auction links show ending-soonest bids and never mix buy-now filters', () => {
  const url = new URL(ebaySearchUrl('Michael Wilson', card, 'PSA 10', 'auction'));
  assert.equal(url.searchParams.get('LH_Auction'), '1');
  assert.equal(url.searchParams.get('LH_BIN'), null);
  assert.equal(url.searchParams.get('LH_Sold'), null);
  assert.equal(url.searchParams.get('_sop'), '1');
});

test('Sold links search completed sales without limiting them to auctions', () => {
  const url = new URL(ebaySearchUrl('Michael Wilson', card, 'PSA 10', 'sold'));
  assert.equal(url.searchParams.get('LH_Sold'), '1');
  assert.equal(url.searchParams.get('LH_Complete'), '1');
  assert.equal(url.searchParams.get('LH_Auction'), null);
  assert.equal(url.searchParams.get('LH_BIN'), null);
  assert.equal(url.searchParams.get('_sop'), '13');
});

test('Listing totals distinguish unknown shipping from free shipping and round dollars', () => {
  assert.equal(listingTotal(listing), 35.98);
  assert.equal(listingTotal({ ...listing, shipping: 0 }), 30.99);
  assert.equal(listingTotal({ ...listing, shipping: null }), null);
  assert.equal(listingTotal({ ...listing, format: 'auction', itemPrice: 8, shipping: 5 }), 13);
});

test('Listing totals stay in the original currency and reject invalid codes or costs', () => {
  assert.equal(listingTotal({ ...listing, currency: 'CAD', itemPrice: .99, shipping: 16.86 }), 17.85);
  assert.equal(listingTotal({ ...listing, currency: 'EUR' }), 35.98);
  assert.equal(listingTotal({ ...listing, currency: 'invalid' }), null);
  assert.equal(listingTotal({ ...listing, currency: 'ZZZ' }), null);
  for (const itemPrice of [-1, Infinity, NaN]) assert.equal(listingTotal({ ...listing, itemPrice }), null);
  for (const shipping of [-1, Infinity, NaN]) assert.equal(listingTotal({ ...listing, shipping }), null);
});

test('Listing freshness marks confirmed ended auctions before stale timestamps', () => {
  const now = new Date('2026-10-06T19:00:00Z');
  assert.equal(listingState({ ...listing, format: 'auction', endAt: '2026-10-06T19:00:00Z', checkedAt: '2026-10-01T18:00:00Z' }, now), 'ended');
  assert.equal(listingState({ ...listing, endAt: '2026-10-06T19:00:01Z' }, now), 'checked');
  assert.equal(listingState({ ...listing, endAt: 'invalid' }, now), 'checked');
});

test('Listing freshness is stale after 24 hours and for invalid or future checks', () => {
  const now = new Date('2026-10-06T19:00:00Z');
  assert.equal(listingState(listing, now), 'checked');
  assert.equal(listingState({ ...listing, checkedAt: '2026-10-05T19:00:00Z' }, now), 'checked');
  assert.equal(listingState({ ...listing, checkedAt: '2026-10-05T18:59:59Z' }, now), 'stale');
  assert.equal(listingState({ ...listing, checkedAt: 'invalid' }, now), 'stale');
  assert.equal(listingState({ ...listing, checkedAt: '2026-10-07T19:00:00Z' }, now), 'stale');
});
