// TEMPORARY diagnostic -- буде видалено одразу після тесту (§21 завдання:
// перевірити store-level consistency:"strong" варіант, якого минулого
// циклу НЕ тестували окремо, лише per-read варіант). Ізольований endpoint,
// НЕ торкається жодного production code path (не /_lib/conditional-write.js,
// не жодного реального store) -- пише/читає лише в окремий тестовий
// "temp-consistency-probe" Blobs store, синтетичний ключ, не production дані.
// Навмисно БЕЗ requireAdmin -- ADMIN_TOKEN не встановлено на Netlify (O-06),
// а цей endpoint не містить PII/бізнес-логіки, лише синтетичний probe-запис
// (той самий прецедент, що debug-blobs.js в AUTOMATION OPERATIONS циклі:
// тимчасовий, незахищений, видаляється одразу після використання).
"use strict";

const { getStore } = require("@netlify/blobs");
const { withBlobs } = require("./_lib/with-blobs");

exports.handler = withBlobs(async (event) => {
  const results = {};
  const key = `probe-${Date.now()}`;
  const value = { probe: true, at: new Date().toISOString() };

  // Варіант 1: store-level consistency:"strong" (getStore({consistency}))
  try {
    const strongStore = getStore({ name: "temp-consistency-probe", consistency: "strong" });
    await strongStore.setJSON(key, value);
    const readBack = await strongStore.get(key, { type: "json" });
    results.storeLevelStrong = { ok: true, readBackMatches: !!readBack };
  } catch (err) {
    results.storeLevelStrong = { ok: false, error: String(err && err.message) };
  }

  // Варіант 2: per-read consistency:"strong" (той, що вже відхилено минулого
  // циклу -- повторюємо тут лише для повноти в одному прогоні, не окремим
  // production-зачіпаючим комітом).
  try {
    const normalStore = getStore("temp-consistency-probe");
    const key2 = `${key}-perread`;
    await normalStore.setJSON(key2, value);
    const readBack2 = await normalStore.get(key2, { type: "json", consistency: "strong" });
    results.perReadStrong = { ok: true, readBackMatches: !!readBack2 };
  } catch (err) {
    results.perReadStrong = { ok: false, error: String(err && err.message) };
  }

  return { statusCode: 200, body: JSON.stringify(results) };
});
