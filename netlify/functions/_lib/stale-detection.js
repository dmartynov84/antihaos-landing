// Технічна (не бізнесова) stale-детекція: "ця invocation ймовірно
// зависла/не завершилась", НЕ "ми порушили SLA перед клієнтом". Бізнес-
// SLA (наприклад, support response time) -- окреме рішення власника
// (docs/owner-blockers.md O-08), не винаходиться тут.
"use strict";

const TECHNICAL_STALE_THRESHOLDS_MS = {
  pending: 10 * 60 * 1000,
  processing: 10 * 60 * 1000,
  retry_scheduled: 24 * 60 * 60 * 1000,
};

function classifyStaleness(record, now = Date.now()) {
  const threshold = TECHNICAL_STALE_THRESHOLDS_MS[record.status];
  if (!threshold) return null;
  const ageMs = now - new Date(record.updatedAt).getTime();
  if (ageMs < threshold) return null;
  return {
    workflowId: record.workflowId,
    status: record.status,
    ageMs,
    thresholdMs: threshold,
    kind: "technical_stale",
  };
}

module.exports = { classifyStaleness, TECHNICAL_STALE_THRESHOLDS_MS };
