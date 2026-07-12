// Immutable append-only event store (Netlify Blobs). Джерело істини для
// lead/VIP/support/refund workflow-ів — НЕ contact/order snapshot.
// Snapshot/projection — це похідний, перебудовуваний кеш; race condition
// на projection більше не губить дані, бо повну історію завжди можна
// перегорнути заново з events. Ключ = entityType:entityId::idempotencyKey,
// що дає одночасно (а) dedup через setIfAbsent (get-then-set, невеликий
// race window — не справжній atomic onlyIfNew, той не працює на цій
// встановленій версії @netlify/blobs, див. _lib/conditional-write.js)
// і (б) list за префіксом для перебудови projection.
"use strict";

const { getStore } = require("@netlify/blobs");
const crypto = require("crypto");
const { setIfAbsent, getWithRetry } = require("./conditional-write");

const SCHEMA_VERSION = 1;

function eventsStore() {
  return getStore("automation-events");
}

function idemKey(entityType, entityId, idempotencyKey) {
  return `${entityType}:${entityId}::${idempotencyKey}`;
}

// idempotencyKey МАЄ бути детермінованим для подій, що можуть повторитись
// (наприклад, платформний retry того самого form submission) -- викликач
// відповідає за це, appendEvent лише гарантує dedup на рівні сховища.
async function appendEvent({ eventType, entityType, entityId, workflowId, correlationId, idempotencyKey, source, payload, status }) {
  if (!idempotencyKey) throw new Error("appendEvent: idempotencyKey is required");
  const store = eventsStore();
  const key = idemKey(entityType, entityId, idempotencyKey);
  const envelope = {
    event_id: crypto.randomUUID(),
    event_type: eventType,
    schema_version: SCHEMA_VERSION,
    entity_type: entityType,
    entity_id: entityId,
    workflow_id: workflowId || null,
    correlation_id: correlationId || null,
    idempotency_key: idempotencyKey,
    timestamp: new Date().toISOString(),
    source: source || "unknown",
    status: status || "accepted",
    payload: payload || {},
  };
  const { modified, value } = await setIfAbsent(store, key, envelope);
  if (!modified) {
    return { event: value, wasNew: false };
  }
  return { event: envelope, wasNew: true };
}

// list() найшла ключ мілісекунди тому, а get() на ТОЙ САМИЙ ключ з
// окремого виклику функції може повернути null (cross-invocation read
// lag на point-reads, підтверджено діагностикою на проді, не
// припущенням) -- getWithRetry перечитує з backoff замість того, щоб
// довіряти першому null і мовчки відфільтрувати щойно записану подію.
async function listEvents(entityType, entityId) {
  const store = eventsStore();
  const { blobs } = await store.list({ prefix: `${entityType}:${entityId}::` });
  const events = await Promise.all(blobs.map((b) => getWithRetry(store, b.key)));
  return events.filter(Boolean).sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

function sha256(text) {
  return crypto.createHash("sha256").update(text).digest("hex").slice(0, 24);
}

module.exports = { appendEvent, listEvents, sha256, SCHEMA_VERSION };
