// Спільний патерн "дублікат чи новий" + unguessable public ID для
// support/refund/VIP requests. НАВМИСНО відокремлено від events.js
// idempotencyKey: контентний хеш (email+category+message+timeBucket)
// добре підходить для dedup, АЛЕ був би вгадуваним "токеном статусу",
// якби показувався клієнту напряму (§27, атака "отримати status чужого
// request" — хтось, хто знає email жертви й приблизний текст, міг би
// обчислити той самий хеш). Тому: dedupKey лишається лише внутрішнім
// ключем пошуку; клієнту повертається окремий crypto.randomUUID().
"use strict";

const { getStore } = require("@netlify/blobs");
const crypto = require("crypto");

function dedupStore(namespace) {
  return getStore(`dedup-${namespace}`);
}

async function resolvePublicId(namespace, dedupKey) {
  const store = dedupStore(namespace);
  const existing = await store.get(dedupKey, { type: "json" });
  if (existing) return { publicId: existing.publicId, isNew: false };

  const publicId = crypto.randomUUID();
  const { modified } = await store.setJSON(dedupKey, { publicId }, { onlyIfNew: true });
  if (!modified) {
    const winner = await store.get(dedupKey, { type: "json" });
    return { publicId: winner.publicId, isNew: false };
  }
  return { publicId, isNew: true };
}

module.exports = { resolvePublicId };
