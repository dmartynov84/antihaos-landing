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
const { setIfAbsent } = require("./conditional-write");

function dedupStore(namespace) {
  return getStore(`dedup-${namespace}`);
}

async function resolvePublicId(namespace, dedupKey) {
  const store = dedupStore(namespace);
  const publicId = crypto.randomUUID();
  const { modified, value } = await setIfAbsent(store, dedupKey, { publicId });
  if (!modified) return { publicId: value.publicId, isNew: false };
  return { publicId, isNew: true };
}

// client_request_id: клієнт генерує crypto.randomUUID() один раз і
// повторно шле той самий рядок при retry/reload того самого подання
// (localStorage). Приймаємо лише формат, схожий на UUID/непрозорий
// токен розумної довжини -- не довільний контент, щоб не перетворити
// це на ще один вектор для непередбачуваних ключів у Blobs.
function isValidClientRequestId(value) {
  return typeof value === "string" && /^[a-zA-Z0-9_-]{8,100}$/.test(value);
}

module.exports = { resolvePublicId, isValidClientRequestId };
