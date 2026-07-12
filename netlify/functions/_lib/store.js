// Обгортка над Netlify Blobs. Три сховища:
//  - orders: order-record за orderId (read-modify-write, тому paid-перехід
//    робимо один раз і перевіряємо статус перед повторним записом);
//  - webhook-events: dedupe за eventId через onlyIfNew — атомарний захист
//    від повторної/паралельної обробки того самого webhook-виклику;
//  - audit-log: append-only, кожен запис — окремий blob (orderId:ts:type),
//    без read-modify-write, тому паралельні записи не конфліктують.
"use strict";

const { getStore } = require("@netlify/blobs");

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

async function getOrder(orderId) {
  const store = orders();
  return store.get(orderId, { type: "json" });
}

async function updateOrder(orderId, patch) {
  const store = orders();
  const current = await store.get(orderId, { type: "json" });
  if (!current) return null;
  const next = { ...current, ...patch, updatedAt: new Date().toISOString() };
  await store.setJSON(orderId, next);
  return next;
}

// Повертає true, якщо це ПЕРШЕ бачення eventId (отже, слід обробити).
// Повертає false, якщо подія вже була оброблена (replay/duplicate webhook) —
// викликач має відповісти 200 і нічого не робити повторно.
// ВАЖЛИВО: setJSON з onlyIfNew НЕ кидає виняток при конфлікті — повертає
// { modified: false }. Перевіряти саме це поле, а не try/catch.
async function markEventOnce(eventId) {
  const store = webhookEvents();
  const result = await store.setJSON(eventId, { seenAt: new Date().toISOString() }, { onlyIfNew: true });
  return result.modified === true;
}

async function appendAudit(orderId, type, data) {
  const store = auditLog();
  const key = `${orderId}:${Date.now()}:${type}`;
  await store.setJSON(key, { orderId, type, data, at: new Date().toISOString() });
}

async function listAudit(orderId) {
  const store = auditLog();
  const { blobs } = await store.list({ prefix: `${orderId}:` });
  const entries = await Promise.all(blobs.map((b) => store.get(b.key, { type: "json" })));
  return entries.filter(Boolean).sort((a, b) => a.at.localeCompare(b.at));
}

module.exports = { createOrder, getOrder, updateOrder, markEventOnce, appendAudit, listAudit };
