// setJSON(key, value, {onlyIfNew:true}) is documented by Netlify to
// return { modified, etag } — but the actually-installed @netlify/blobs
// version (package.json "^8.1.0", exact resolved version not pinned)
// returns undefined, causing `const { modified } = await store.setJSON(...)`
// to throw TypeError on destructure. Confirmed by LIVE adversarial
// testing on production (support-submit.js, 10 parallel identical
// requests), not by reading the docs a second time — this cycle's whole
// point was not to trust an unexercised code path.
//
// Fix: get-then-set-if-absent instead of chasing the exact onlyIfNew
// contract for whatever version actually resolves. This accepts a small
// race window (two near-simultaneous requests for the same key can both
// pass the "not found" check, and the second overwrites the first) —
// acceptable for lead/support/refund/VIP dedup, where the cost of a rare
// duplicate is a redundant record, not lost money. Checkout's webhook
// idempotency (real stakes) uses this same helper now too, since it was
// equally unexercised and would have hit the identical crash the moment
// CHECKOUT_MODE stops being disabled.
"use strict";

async function setIfAbsent(store, key, value) {
  const existing = await store.get(key, { type: "json" });
  if (existing) return { modified: false, value: existing };
  await store.setJSON(key, value);
  return { modified: true, value };
}

module.exports = { setIfAbsent };
