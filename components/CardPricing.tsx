'use client';

import { useEffect, useState } from 'react';
import { ArrowUpRight, Gavel, ShoppingBag } from 'lucide-react';
import type { Card } from '@/lib/types';
import type { Listing, ListingSnapshot } from '@/lib/ebay';
import { ebaySearchUrl, listingState, listingTotal } from '@/lib/ebay';
import { saleSummary, type SoldSale } from '@/lib/market';
import { date, money } from './shared';

type Props = { player: string; card?: Card; snapshot: ListingSnapshot; sales: SoldSale[] };
const buckets = ['ALL', 'RAW', 'PSA 9', 'PSA 10', 'SGC 9.5', 'BGS 9.5', 'CGC 10'];
const price = (amount: number, currency: string) => new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);

export default function CardPricing({ player, card, snapshot, sales }: Props) {
  const [bucket, setBucket] = useState('ALL');
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const timer = setInterval(() => setNow(new Date()), 60000); return () => clearInterval(timer); }, []);
  const listings = snapshot.listings.filter(listing => card && listing.cardId === card.id && listingState(listing, now) !== 'ended' && (bucket === 'ALL' || (bucket === 'RAW' ? listing.grader === 'RAW' : `${listing.grader} ${listing.grade}` === bucket)));
  const soldBuckets = bucket === 'ALL' ? ['RAW', 'PSA 9', 'PSA 10'] : [bucket];

  return <section className="panel pricing-panel" aria-label="Card prices and eBay listings">
    <div className="panel-heading"><div><div className="eyebrow">PRICES YOU CAN CHECK</div><h2>Card prices & eBay listings</h2><p>{card ? `${card.year} ${card.manufacturer} ${card.set} ${card.parallel} · #${card.cardNumber} · ${player}` : `${player} · Prizm Silver rookie search`}</p></div><span className="pill amber">{!listings.length ? 'SEARCH EBAY' : snapshot.status === 'live' ? 'LISTING SNAPSHOT' : snapshot.status === 'manual' ? 'MANUALLY CHECKED' : 'CHECK ON EBAY'}</span></div>
    <div className="shopping-tools"><label>Card grade<select value={bucket} onChange={e => setBucket(e.target.value)}>{buckets.map(value => <option key={value} value={value}>{value === 'ALL' ? 'All grades' : value === 'RAW' ? 'Raw / ungraded' : value}</option>)}</select></label><div className="shopping-actions"><a className="primary-btn" href={ebaySearchUrl(player, card, bucket, 'buy-now')} target="_blank" rel="noreferrer"><ShoppingBag size={16} /> Search Buy It Now <ArrowUpRight size={15} /></a><a className="outline-btn" href={ebaySearchUrl(player, card, bucket, 'auction')} target="_blank" rel="noreferrer"><Gavel size={16} /> Search auctions <ArrowUpRight size={15} /></a></div></div>
    <p className="pricing-note">{card ? 'Searches target this issue and grade. Check the listing photos and label; eBay may include other cards.' : 'Review the exact issue before buying. No verified card number has been cataloged for this player.'} Buy It Now searches sort by price + shipping; auctions sort by ending soonest.</p>
    <div className="listing-grid">{listings.map(listing => <ListingPrice key={listing.id} listing={listing} now={now} />)}</div>
    {!listings.length && <p className="pricing-empty">No checked listing quotes for this selection. Open the eBay searches above for current prices and availability.</p>}
    <p className="pricing-note">Checked quotes are a snapshot, not an automatic price feed. Confirm the current price, availability, end time, and shipping for your address on eBay. Auctions can rise; taxes and buyer charges are excluded. Quotes older than 24 hours are marked for refresh.</p>
    <div className="sold-price-guide"><div className="sold-guide-heading"><h3>Sold prices · past 30 days</h3><a className="source" href={ebaySearchUrl(player, card, bucket, 'sold')} target="_blank" rel="noreferrer">Check sold listings on eBay <ArrowUpRight size={13} /></a></div><p>USD item-price median from your imported exact-card sales. Active asks and bids do not enter this value.</p><div className="sold-guide-grid">{soldBuckets.map(value => {
      const [grader, grade] = value === 'RAW' ? ['RAW', 'RAW'] : value.split(' ');
      const summary = card ? saleSummary(sales.filter(sale => sale.currency === 'USD'), card.id, grader, grade, 30, now) : null;
      return <div key={value}><span>{value === 'RAW' ? 'Raw / ungraded' : value}</span><b>{summary?.median != null ? money(summary.median) : 'No recent sold comps'}</b><small>{summary?.median != null ? `${summary.count} comps · ${money(summary.min)}–${money(summary.max)}${summary.actionable ? '' : ' · thin sample'}` : summary?.labelIssue || 'Import sold records to establish a value'}</small></div>;
    })}</div></div>
  </section>;
}

function ListingPrice({ listing, now }: { listing: Listing; now: Date }) {
  const state = listingState(listing, now), total = listingTotal(listing);
  const auction = listing.format === 'auction';
  const bidLabel = listing.bids === 0 ? 'Starting bid' : 'Current bid';
  return <article className={`listing-card ${state === 'stale' ? 'stale-quote' : ''}`}>
    <div className="listing-card-top"><span className={`pill ${auction ? 'amber' : 'green'}`}>{auction ? 'AUCTION' : 'BUY IT NOW'}</span><span>{listing.grader === 'RAW' ? 'Raw / ungraded' : `${listing.grader} ${listing.grade}`}</span></div>
    <h3>{listing.title}</h3><p className="listing-seller">Seller: {listing.seller}</p>
    <span className="listing-price-label">{auction ? bidLabel : 'Buy It Now price'}</span><div className="listing-price">{price(listing.itemPrice, listing.currency)} <small>{listing.currency}</small></div>
    <div className="listing-breakdown"><span>Shipping quote</span><b>{listing.shipping == null ? 'Check shipping on eBay' : listing.shipping === 0 ? 'Free' : price(listing.shipping, listing.currency)}</b><span>{auction ? `${bidLabel} + shipping` : 'Item + shipping'}</span><b>{total == null ? 'Total unavailable' : price(total, listing.currency)}</b></div>
    <p className="listing-meta">Before tax{auction && listing.bids != null ? ` · ${listing.bids} bids at check` : ''}{listing.bestOffer ? ' · Best Offer available' : ''}{listing.endAt ? ` · Ends ${date(listing.endAt)}` : auction ? ' · Check end time on eBay' : ''}</p>
    <p className="listing-check">{state === 'stale' ? 'Quote needs refresh' : 'Checked'} · {date(listing.checkedAt)}</p>
    <a className="outline-btn full-width" href={listing.url} target="_blank" rel="noreferrer">{state === 'stale' ? 'Check listing on eBay' : auction ? 'Bid on eBay' : 'Buy on eBay'} <ArrowUpRight size={15} /></a>
  </article>;
}
