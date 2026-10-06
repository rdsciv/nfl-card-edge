import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import CardPricing from '../components/CardPricing';
import type { Listing, ListingSnapshot } from '../lib/ebay';
import type { Card } from '../lib/types';

const card: Card = { id: 'wilson-silver', playerId: null, player: 'Michael Wilson', year: 2023, manufacturer: 'Panini', set: 'Prizm', cardNumber: '303', parallel: 'Silver', rookie: true, verified: true, sourceUrl: 'https://example.com/checklist', verifiedAt: '2026-10-06' };
const listing: Listing = { id: '123', cardId: card.id, title: 'Michael Wilson Silver #303', grader: 'RAW', grade: 'RAW', format: 'auction', itemPrice: 0.99, shipping: 16.86, currency: 'CAD', url: 'https://www.ebay.com/itm/123', seller: 'Example seller', checkedAt: new Date().toISOString(), bids: 0 };
const snapshot = (listings: Listing[]): ListingSnapshot => ({ status: 'manual', updatedAt: listing.checkedAt, listings });

test('pricing shows original-currency auction bid separately from fixed ask and sold value', () => {
  const html = renderToStaticMarkup(<CardPricing player="Michael Wilson" card={card} snapshot={snapshot([{ ...listing, bids: 2 }, { ...listing, id: '456', format: 'buy-now', currency: 'USD', itemPrice: 24.99, shipping: 4.49, grader: 'PSA', grade: '9', url: 'https://www.ebay.com/itm/456' }])} sales={[]} />);
  assert.match(html, /Current bid/);
  assert.match(html, /CAD/);
  assert.match(html, /17\.85/);
  assert.match(html, /Buy It Now price/);
  assert.match(html, /29\.48/);
  assert.match(html, /href="https:\/\/www\.ebay\.com\/itm\/123"/);
  assert.match(html, /Bid on eBay/);
  assert.match(html, /Buy on eBay/);
  assert.match(html, /No recent sold comps/);
});

test('a zero-bid auction shows its starting bid rather than implying a bid has been placed', () => {
  const html = renderToStaticMarkup(<CardPricing player="Michael Wilson" card={card} snapshot={snapshot([listing])} sales={[]} />);
  assert.match(html, /Starting bid/);
  assert.match(html, /Starting bid \+ shipping/);
  assert.doesNotMatch(html, /Current bid/);
});

test('unknown shipping never creates an item-plus-shipping total', () => {
  const html = renderToStaticMarkup(<CardPricing player="Michael Wilson" card={card} snapshot={snapshot([{ ...listing, shipping: null }])} sales={[]} />);
  assert.match(html, /Check shipping on eBay/);
  assert.match(html, /Total unavailable/);
  assert.doesNotMatch(html, /17\.85/);
});

test('ended auctions have no bid action and stale quotes require a current listing check', () => {
  const html = renderToStaticMarkup(<CardPricing player="Michael Wilson" card={card} snapshot={snapshot([{ ...listing, endAt: new Date(Date.now() - 1000).toISOString() }, { ...listing, id: 'stale', checkedAt: new Date(Date.now() - 25 * 3600000).toISOString() }])} sales={[]} />);
  assert.doesNotMatch(html, />Bid on eBay/);
  assert.match(html, /Quote needs refresh/);
  assert.match(html, /Check listing on eBay/);
});

test('an uncataloged player gets clearly labeled searches and no borrowed card prices', () => {
  const html = renderToStaticMarkup(<CardPricing player="Tyler Shough" snapshot={snapshot([listing])} sales={[]} />);
  assert.match(html, /Search auctions/);
  assert.match(html, /Search Buy It Now/);
  assert.match(html, /Review the exact issue/);
  assert.doesNotMatch(html, /Example seller/);
});
