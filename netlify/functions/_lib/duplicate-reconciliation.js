// Duplicate reconciliation -- постфактум-виявлення дублів, окреме від
// синхронного dedup (support-submit.js/refund-submit.js/vip-trigger.js).
// Мотивація виміряна ЖИВИМ тестом цього циклу: два submit впритул (без
// паузи) з тим самим client_request_id НЕ дедуплікувались (read-lag на
// самій dedup-перевірці) -- отже синхронний dedup best-effort, а не
// гарантія, і потрібен окремий, асинхронний механізм для випадків, коли
// він не спрацював. НІЧОГО не видаляється -- events лишаються immutable,
// це рішення лише додає метадані поверх.
"use strict";

const { getStore } = require("@netlify/blobs");
const { listEvents, listEntityIds } = require("./events");
const { getWithRetry } = require("./conditional-write");

const CREATION_EVENT_TYPES = {
  support_request: "support_request_created",
  refund_request: "refund_request_created",
  vip_workflow: "vip_workflow_created",
};

function reconciliationStore() {
  return getStore("duplicate-reconciliation");
}

// Що робить дві РІЗНІ сутності "тим самим реальним поданням": той самий
// email + та сама категорія/причина/факт. НЕ контент повідомлення --
// умисно грубіше за dedup-хеш, бо мета тут інша: піймати саме ті
// випадки, де dedup-хеш пропустив дубль через гонку/read-lag, а не
// повторити ту саму перевірку.
function fingerprint(entityType, payload) {
  if (!payload) return null;
  if (entityType === "support_request") return `${payload.email}|${payload.category}`;
  if (entityType === "refund_request") return `${payload.email}|${payload.orderId}`;
  if (entityType === "vip_workflow") return `${payload.email}`;
  return null;
}

async function detectCandidates(entityType, { windowMinutes = 15 } = {}) {
  const creationEventType = CREATION_EVENT_TYPES[entityType];
  if (!creationEventType) throw new Error(`duplicate-reconciliation: unknown entityType ${entityType}`);

  const entityIds = await listEntityIds(entityType);
  const records = [];
  for (const entityId of entityIds) {
    const events = await listEvents(entityType, entityId);
    const creation = events.find((e) => e.event_type === creationEventType);
    if (!creation) continue;
    records.push({ entityId, timestamp: creation.timestamp, fingerprint: fingerprint(entityType, creation.payload) });
  }
  records.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  const groups = new Map();
  for (const r of records) {
    if (!r.fingerprint) continue;
    if (!groups.has(r.fingerprint)) groups.set(r.fingerprint, []);
    groups.get(r.fingerprint).push(r);
  }

  const candidates = [];
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const canonicalEntityId = group[0].entityId;
    for (let i = 1; i < group.length; i++) {
      const gapMs = new Date(group[i].timestamp) - new Date(group[0].timestamp);
      if (gapMs <= windowMinutes * 60 * 1000) {
        candidates.push({
          entityType,
          entityId: group[i].entityId,
          canonicalEntityId,
          fingerprint: group[i].fingerprint,
          gapMs,
          timestamp: group[i].timestamp,
        });
      }
    }
  }
  return candidates;
}

const STATES = new Set(["suspected_duplicate", "confirmed_duplicate", "linked_to_canonical", "merged", "false_positive"]);

async function recordDecision({ entityType, entityId, canonicalEntityId, decision, decidedBy, note }) {
  if (!STATES.has(decision)) {
    throw new Error(`duplicate-reconciliation: invalid decision "${decision}"`);
  }
  const store = reconciliationStore();
  const key = `${entityType}:${entityId}`;
  // Update-in-place тут навмисно (на відміну від events.js) -- це
  // ОПЕРАЦІЙНЕ рішення, яке МАЄ змінюватись (false_positive можна
  // переглянути на confirmed_duplicate), а не сам факт заявки. Заявка
  // сама лишається незмінною в automation-events назавжди.
  const record = {
    entityType,
    entityId,
    canonicalEntityId: canonicalEntityId || null,
    decision,
    decidedBy: decidedBy || "owner",
    decidedAt: new Date().toISOString(),
    note: note || null,
  };
  await store.setJSON(key, record);
  return record;
}

async function getDecision(entityType, entityId) {
  return getWithRetry(reconciliationStore(), `${entityType}:${entityId}`);
}

module.exports = { detectCandidates, recordDecision, getDecision, STATES };
