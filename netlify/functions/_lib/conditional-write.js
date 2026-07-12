// setJSON(key, value, {onlyIfNew:true}) is documented by Netlify to
// return { modified, etag } — but the actually-installed @netlify/blobs
// version (package.json "^8.1.0", exact resolved version not pinned)
// returns undefined, causing `const { modified } = await store.setJSON(...)`
// to throw TypeError on destructure. Confirmed by LIVE adversarial
// testing on production, not by reading the docs a second time.
//
// SECOND finding from the same adversarial round: store.get(exactKey)
// can return null for a key that store.list({prefix}) already confirms
// exists — a cross-invocation read lag on point-reads specifically
// (confirmed via netlify/functions/debug-blobs.js: list() found a key
// milliseconds after a different invocation wrote it, but get() on that
// same key returned null). getWithRetry() below re-reads with backoff
// instead of trusting the first null.
"use strict";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getWithRetry(store, key, { attempts = 4, delayMs = 300 } = {}) {
  for (let i = 0; i < attempts; i++) {
    const value = await store.get(key, { type: "json" });
    if (value !== null && value !== undefined) return value;
    if (i < attempts - 1) await sleep(delayMs);
  }
  return null;
}

// get-then-set-if-absent instead of chasing the exact onlyIfNew contract
// for whatever version resolves. Accepts a small race window (two
// near-simultaneous requests can both pass the "not found" check) —
// acceptable for lead/support/refund/VIP dedup and checkout webhook
// idempotency, where the cost of a rare duplicate is a redundant
// record, not lost money (real checkout money-handling is separately
// gated off entirely right now). Uses getWithRetry for the existence
// check specifically because of the read-lag finding above.
async function setIfAbsent(store, key, value) {
  const existing = await getWithRetry(store, key, { attempts: 2, delayMs: 250 });
  if (existing) return { modified: false, value: existing };
  await store.setJSON(key, value);
  return { modified: true, value };
}

module.exports = { setIfAbsent, getWithRetry };
