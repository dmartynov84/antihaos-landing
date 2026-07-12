// Спільний retry/dead-letter стан для будь-якого workflow (lead
// projection, VIP, support, refund). Один Blobs-стор, keyed за
// workflowId. Не автоматичний cron-виконавець retry (немає budget цього
// циклу перевірити Netlify Scheduled Functions наживо без ризику ще
// одного недоперевіреного шару) -- це durable ЗАПИС стану, який (а)
// гарантує, що подія не губиться, і (б) дає точку для authenticated
// manual replay (docs/runbooks/replay-dead-letter.md).
"use strict";

const { getStore } = require("@netlify/blobs");

const MAX_RETRIES = 5;
const BASE_BACKOFF_SECONDS = 60;

const RETRYABLE_REASON_CODES = new Set([
  "blob_temporary_failure", "timeout", "email_provider_5xx",
  "crm_provider_5xx", "storage_temporary_failure",
]);
const NON_RETRYABLE_REASON_CODES = new Set([
  "invalid_input", "invalid_signature", "unknown_product",
  "missing_legal_gate", "malformed_order", "forbidden_transition",
]);

function isRetryable(reasonCode) {
  return RETRYABLE_REASON_CODES.has(reasonCode);
}

function workflowStore() {
  return getStore("workflow-status");
}

async function createWorkflowStatus(workflowId, meta) {
  const store = workflowStore();
  const record = {
    workflowId,
    status: "pending",
    retryCount: 0,
    lastErrorCode: null,
    nextRetryAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    meta: meta || {},
  };
  await store.setJSON(workflowId, record);
  return record;
}

async function getWorkflowStatus(workflowId) {
  return workflowStore().get(workflowId, { type: "json" });
}

async function transition(workflowId, patch) {
  const store = workflowStore();
  const current = await store.get(workflowId, { type: "json" });
  if (!current) return null;
  const next = { ...current, ...patch, updatedAt: new Date().toISOString() };
  await store.setJSON(workflowId, next);
  return next;
}

async function markProcessing(workflowId) {
  return transition(workflowId, { status: "processing" });
}

async function markCompleted(workflowId) {
  return transition(workflowId, { status: "completed", nextRetryAt: null });
}

// Повертає новий стан ("retry_scheduled" або "dead_letter") -- викликач
// вирішує, чи owner alert потрібен зараз (dead_letter завжди так).
async function markFailure(workflowId, reasonCode) {
  const current = await getWorkflowStatus(workflowId);
  if (!current) return null;
  const retryable = isRetryable(reasonCode);
  const retryCount = current.retryCount + 1;

  if (!retryable || retryCount > MAX_RETRIES) {
    return transition(workflowId, {
      status: "dead_letter",
      retryCount,
      lastErrorCode: reasonCode,
      nextRetryAt: null,
    });
  }

  const backoffSeconds = BASE_BACKOFF_SECONDS * Math.pow(2, retryCount - 1);
  const nextRetryAt = new Date(Date.now() + backoffSeconds * 1000).toISOString();
  return transition(workflowId, {
    status: "retry_scheduled",
    retryCount,
    lastErrorCode: reasonCode,
    nextRetryAt,
  });
}

async function markManuallyReplayed(workflowId) {
  return transition(workflowId, { status: "manually_replayed" });
}

async function markCancelled(workflowId, reasonCode) {
  return transition(workflowId, { status: "cancelled", lastErrorCode: reasonCode || null });
}

module.exports = {
  MAX_RETRIES, isRetryable,
  createWorkflowStatus, getWorkflowStatus,
  markProcessing, markCompleted, markFailure, markManuallyReplayed, markCancelled,
};
