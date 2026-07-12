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
// OWNER OPERATIONS цикл: офіційна документація каже, що це — задокументований
// eventual-consistency trade-off (edge-кеш, до 60с), і що `{consistency:
// "strong"}` на read має його усунути. ПЕРЕВІРЕНО живим тестом на
// production і ВІДХИЛЕНО: `consistency:"strong"` кинув
// `BlobsConsistencyError: ... has not been configured with a
// 'uncachedEdgeURL' property` — саме в цьому Lambda-compatibility
// runtime (connectLambda-injected credentials, `_lib/with-blobs.js`),
// а не в звичайному Netlify Functions v2/Edge контексті, який
// документація малась на увазі. ТРЕТЯ підряд розбіжність docs-vs-
// production цього напрямку — задокументовано в ADR
// (docs/adr/ADR-automation-storage-consistency.md), consistency:"strong"
// НЕ використовується ніде в цьому кодовому шляху. Повернуто до
// retry-based mitigation (8×500ms ~4s), що вже перевірено й прийнято
// цього циклу як чесний, working-in-practice підхід, доповнений
// client-side polling там, де це видно користувачу.
"use strict";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getWithRetry(store, key, { attempts = 8, delayMs = 500 } = {}) {
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
  const existing = await getWithRetry(store, key, { attempts: 4, delayMs: 400 });
  if (existing) return { modified: false, value: existing };
  await store.setJSON(key, value);
  return { modified: true, value };
}

module.exports = { setIfAbsent, getWithRetry };
