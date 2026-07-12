// setJSON(key, value, {onlyIfNew:true}) is documented by Netlify to
// return { modified, etag } — but the actually-installed @netlify/blobs
// version (package.json "^8.1.0", exact resolved version not pinned)
// returns undefined, causing `const { modified } = await store.setJSON(...)`
// to throw TypeError on destructure. Confirmed by LIVE adversarial
// testing on production, not by reading the docs a second time.
//
// SECOND finding from the same adversarial round: store.get(exactKey)
// can return null for a key that store.list({prefix}) already confirms
// exists — a cross-invocation read lag on point-reads specifically.
// OWNER OPERATIONS цикл, root cause: Netlify Blobs default reads are
// EVENTUALLY consistent — official docs state updates/writes propagate
// to edge caches within up to 60s (our empirical worst case last cycle,
// ~15-20s, was within that documented window, not an undocumented bug —
// we just hadn't re-checked docs against production before). Netlify's
// SDK exposes a real fix: `{ consistency: "strong" }` on `get()`
// routes the read through Netlify's API instead of the edge cache, at
// the cost of higher read latency. Applied below for exactly the paths
// where correctness (not raw speed) matters: dedup checks and any
// point-read of a key that may have just been written by another
// invocation. The retry loop is KEPT as defense-in-depth (docs have
// been wrong before this cycle too — see setJSON above), not removed,
// but strong consistency is now the primary fix, not blind retrying.
"use strict";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getWithRetry(store, key, { attempts = 3, delayMs = 400, consistency = "strong" } = {}) {
  for (let i = 0; i < attempts; i++) {
    const value = await store.get(key, { type: "json", consistency });
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
  const existing = await getWithRetry(store, key, { attempts: 2, delayMs: 300, consistency: "strong" });
  if (existing) return { modified: false, value: existing };
  await store.setJSON(key, value);
  return { modified: true, value };
}

module.exports = { setIfAbsent, getWithRetry };
