// Обгортка над Netlify Blobs. Три сховища:
//  - orders: order-record за orderId (read-modify-write, тому paid-перехід
//    робимо один раз і перевіряємо статус перед повторним записом);
//  - webhook-events: dedupe за eventId через onlyIfNew — атомарний захист
//    від повторної/паралельної обробки того самого webhook-виклику;
//  - audit-log: append-only, кожен запис — окремий blob (orderId:ts:type),
//    без read-modify-write, тому паралельні записи не конфліктують.
"use strict";

const { getStore } = require("@netlify/blobs");
const { setIfAbsent, getWithRetry } = require("./conditional-write");

function orders() {
  return getStore("checkout-orders");
}
function webhookEvents() {
  return getStore("checkout-webhook-events");
}
function auditLog() {
  return getStore("checkout-audit-log");
}

async function createOrder(order) {
  const store = orders();
  await store.setJSON(order.id, order);
  return order;
}

// getWithRetry -- see _lib/conditional-write.js: a live production
// diagnostic this cycle showed store.get(key) can return null for a key
// that store.list() confirms exists, moments after a different
// invocation wrote it (cross-invocation read lag on point-reads).
async function getOrder(orderId) {
  const store = orders();
  return getWithRetry(store, orderId);
}

async function updateOrder(orderId, patch) {
  const store = orders();
  const current = await getWithRetry(store, orderId);
  if (!current) return null;
  const next = { ...current, ...patch, updatedAt: new Date().toISOString() };
  await store.setJSON(orderId, next);
  return next;
}

// Повертає true, якщо це ПЕРШЕ бачення eventId (отже, слід обробити).
// Повертає false, якщо подія вже була оброблена (replay/duplicate webhook) —
// викликач має відповісти 200 і нічого не робити повторно.
// AUTOMATION OPERATIONS цикл: onlyIfNew насправді НЕ повертає
// {modified,etag} для встановленої версії @netlify/blobs -- повертає
// undefined і кидає TypeError на деструктуризації (знайдено живою
// адверсаріальною перевіркою support-workflow, той самий патерн тут
// ніколи не був справді пройдений, бо CHECKOUT_MODE=disabled завжди
// зупиняв виконання раніше). Тепер через setIfAbsent
// (_lib/conditional-write.js) -- get-then-set, невеликий race window,
// прийнятний для webhook-дедуплікації.
async function markEventOnce(eventId) {
  const store = webhookEvents();
  const { modified } = await setIfAbsent(store, eventId, { seenAt: new Date().toISOString() });
  return modified;
}

async function appendAudit(orderId, type, data) {
  const store = auditLog();
  const key = `${orderId}:${Date.now()}:${type}`;
  await store.setJSON(key, { orderId, type, data, at: new Date().toISOString() });
}

async function listAudit(orderId) {
  const store = auditLog();
  const { blobs } = await store.list({ prefix: `${orderId}:` });
  const entries = await Promise.all(blobs.map((b) => getWithRetry(store, b.key)));
  return entries.filter(Boolean).sort((a, b) => a.at.localeCompare(b.at));
}

module.exports = { createOrder, getOrder, updateOrder, markEventOnce, appendAudit, listAudit };
