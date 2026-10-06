import type { Card } from './types';

export type Listing = {
  id: string; cardId: string; title: string; grader: string; grade: string;
  format: 'auction' | 'buy-now'; itemPrice: number; shipping: number | null;
  currency: string; url: string; seller: string; checkedAt: string;
  endAt?: string | null; bids?: number; bestOffer?: boolean;
};
export type ListingSnapshot = {
  status: 'manual' | 'live' | 'unconfigured' | 'error'; updatedAt: string | null;
  listings: Listing[];
};

export function ebaySearchUrl(player: string, card: Card | undefined, bucket: string, format: 'auction' | 'buy-now' | 'sold'): string {
  const identity = card
    ? [card.year, card.manufacturer, player, card.set, card.parallel, card.cardNumber].filter(Boolean).join(' ')
    : `${player} Prizm Silver rookie`;
  const grade = bucket === 'RAW' ? '-PSA -SGC -BGS -CGC -CSG -graded' : bucket === 'ALL' ? '' : `"${bucket}"`;
  const url = new URL('https://www.ebay.com/sch/i.html');
  url.searchParams.set('_nkw', [identity, grade, '-autograph -auto -variation -lot -reprint -"no huddle"'].filter(Boolean).join(' '));
  url.searchParams.set('_sacat', '261328');
  if (format === 'auction') {
    url.searchParams.set('LH_Auction', '1');
    url.searchParams.set('_sop', '1');
  } else if (format === 'buy-now') {
    url.searchParams.set('LH_BIN', '1');
    url.searchParams.set('_sop', '15');
  } else {
    url.searchParams.set('LH_Sold', '1');
    url.searchParams.set('LH_Complete', '1');
    url.searchParams.set('_sop', '13');
  }
  return url.toString();
}

export function listingTotal(listing: Listing): number | null {
  if (!Intl.supportedValuesOf('currency').includes(listing.currency) || !Number.isFinite(listing.itemPrice) || listing.itemPrice < 0 || listing.shipping === null || !Number.isFinite(listing.shipping) || listing.shipping < 0) return null;
  const total = listing.itemPrice + listing.shipping;
  return Number.isFinite(total) ? Math.round(total * 100) / 100 : null;
}

export function listingState(listing: Listing, now = new Date()): 'ended' | 'stale' | 'checked' {
  if (listing.endAt && Date.parse(listing.endAt) <= now.getTime()) return 'ended';
  const checked = Date.parse(listing.checkedAt);
  const age = now.getTime() - checked;
  return !Number.isFinite(age) || age < 0 || age > 24 * 60 * 60 * 1000 ? 'stale' : 'checked';
}
