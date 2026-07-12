// Реальні виконувані unit-тести для чистої логіки (без Blobs/мережі).
// node:test -- вбудований у Node, жодної нової залежності. Запускається
// в CI (.github/workflows/ci.yml, job unit-tests), яка МАЄ реальний
// Node -- локальна машина розробки Node не має взагалі, тому ЦЕ єдине
// місце, де ця логіка справді виконується, не лише читається очима.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { canTransition, requiresReason, ALLOWED } = require("../vip-state-machine");
const { classifyStaleness, TECHNICAL_STALE_THRESHOLDS_MS } = require("../stale-detection");
const { isRetryable, shouldDeadLetter, computeBackoffSeconds, MAX_RETRIES, BASE_BACKOFF_SECONDS } = require("../workflow-status");
const { maskEmail } = require("../pii");
const { fingerprint, STATES } = require("../duplicate-reconciliation");
const { sha256, idemKey, SCHEMA_VERSION } = require("../events");
const { isValidClientRequestId } = require("../request-dedup");
const { projectContact } = require("../projections");

// ---------- vip-state-machine ----------

test("vip-state-machine: allowed forward transitions succeed", () => {
  assert.equal(canTransition("vip_new", "entitlement_pending"), true);
  assert.equal(canTransition("intake_pending", "intake_received"), true);
  assert.equal(canTransition("support_completed", "closed"), true);
});

test("vip-state-machine: forbidden transitions from spec are rejected", () => {
  // vip_new -> support_active: явно заборонено спецификацією
  assert.equal(canTransition("vip_new", "support_active"), false);
  // calendar_pending -> support_completed: пропуск кроків заборонено
  assert.equal(canTransition("calendar_pending", "support_completed"), false);
  // closed -- термінальний, нікуди далі
  assert.equal(canTransition("closed", "vip_new"), false);
});

test("vip-state-machine: cancelled/failed reachable from any non-terminal state", () => {
  for (const from of Object.keys(ALLOWED)) {
    if (from === "cancelled" || from === "failed" || from === "closed") continue;
    assert.equal(canTransition(from, "cancelled"), true, `${from} -> cancelled should be allowed`);
    assert.equal(canTransition(from, "failed"), true, `${from} -> failed should be allowed`);
  }
});

test("vip-state-machine: requiresReason only for cancelled/failed", () => {
  assert.equal(requiresReason("cancelled"), true);
  assert.equal(requiresReason("failed"), true);
  assert.equal(requiresReason("closed"), false);
  assert.equal(requiresReason("intake_received"), false);
});

// ---------- stale-detection ----------

test("stale-detection: processing under threshold is NOT stale", () => {
  const now = Date.parse("2026-07-19T12:00:00Z");
  const record = { workflowId: "x", status: "processing", updatedAt: "2026-07-19T11:55:00Z" }; // 5 min ago
  assert.equal(classifyStaleness(record, now), null);
});

test("stale-detection: processing over threshold IS stale", () => {
  const now = Date.parse("2026-07-19T12:00:00Z");
  const record = { workflowId: "x", status: "processing", updatedAt: "2026-07-19T11:45:00Z" }; // 15 min ago, threshold 10 min
  const result = classifyStaleness(record, now);
  assert.notEqual(result, null);
  assert.equal(result.kind, "technical_stale");
  assert.equal(result.status, "processing");
});

test("stale-detection: completed status has no threshold (never flagged)", () => {
  const now = Date.parse("2026-07-19T12:00:00Z");
  const record = { workflowId: "x", status: "completed", updatedAt: "2020-01-01T00:00:00Z" }; // very old
  assert.equal(classifyStaleness(record, now), null);
});

test("stale-detection: retry_scheduled threshold is 24h, not 10min", () => {
  const now = Date.parse("2026-07-19T12:00:00Z");
  const twoHoursAgo = { workflowId: "x", status: "retry_scheduled", updatedAt: "2026-07-19T10:00:00Z" };
  assert.equal(classifyStaleness(twoHoursAgo, now), null, "2h should be within 24h retry_scheduled threshold");
  const twoDaysAgo = { workflowId: "x", status: "retry_scheduled", updatedAt: "2026-07-17T12:00:00Z" };
  assert.notEqual(classifyStaleness(twoDaysAgo, now), null, "2 days should exceed 24h threshold");
});

// ---------- workflow-status: retry/backoff/dead-letter decision ----------

test("workflow-status: known retryable codes are retryable", () => {
  assert.equal(isRetryable("blob_temporary_failure"), true);
  assert.equal(isRetryable("timeout"), true);
});

test("workflow-status: known non-retryable codes are not retryable", () => {
  assert.equal(isRetryable("invalid_input"), false);
  assert.equal(isRetryable("forbidden_transition"), false);
});

test("workflow-status: unknown reason code defaults to non-retryable (fail safe)", () => {
  assert.equal(isRetryable("some_new_error_type_nobody_registered"), false);
});

test("workflow-status: shouldDeadLetter true for non-retryable regardless of retryCount", () => {
  assert.equal(shouldDeadLetter("invalid_input", 1), true);
});

test("workflow-status: shouldDeadLetter false while retryable and under MAX_RETRIES", () => {
  assert.equal(shouldDeadLetter("timeout", 1), false);
  assert.equal(shouldDeadLetter("timeout", MAX_RETRIES), false);
});

test("workflow-status: shouldDeadLetter true once retryCount exceeds MAX_RETRIES", () => {
  assert.equal(shouldDeadLetter("timeout", MAX_RETRIES + 1), true);
});

test("workflow-status: computeBackoffSeconds is exponential from BASE_BACKOFF_SECONDS", () => {
  assert.equal(computeBackoffSeconds(1), BASE_BACKOFF_SECONDS);
  assert.equal(computeBackoffSeconds(2), BASE_BACKOFF_SECONDS * 2);
  assert.equal(computeBackoffSeconds(3), BASE_BACKOFF_SECONDS * 4);
  assert.equal(computeBackoffSeconds(5), BASE_BACKOFF_SECONDS * 16);
});

// ---------- pii ----------

test("pii: maskEmail masks local part, keeps domain", () => {
  assert.equal(maskEmail("ivan.petrenko@example.com"), "iv***@example.com");
});

test("pii: maskEmail handles short local parts without throwing", () => {
  assert.equal(maskEmail("a@example.com"), "a***@example.com");
});

test("pii: maskEmail returns null for invalid input", () => {
  assert.equal(maskEmail(""), null);
  assert.equal(maskEmail(null), null);
  assert.equal(maskEmail("not-an-email"), null);
});

// ---------- duplicate-reconciliation ----------

test("duplicate-reconciliation: fingerprint groups support requests by email+category", () => {
  const a = fingerprint("support_request", { email: "x@example.com", category: "general" });
  const b = fingerprint("support_request", { email: "x@example.com", category: "general" });
  const c = fingerprint("support_request", { email: "x@example.com", category: "payment" });
  assert.equal(a, b);
  assert.notEqual(a, c);
});

test("duplicate-reconciliation: fingerprint returns null for unknown entityType", () => {
  assert.equal(fingerprint("unknown_type", { email: "x@example.com" }), null);
});

test("duplicate-reconciliation: STATES has exactly the five defined decisions", () => {
  const expected = ["suspected_duplicate", "confirmed_duplicate", "linked_to_canonical", "merged", "false_positive"];
  for (const s of expected) assert.equal(STATES.has(s), true);
  assert.equal(STATES.size, expected.length);
});

// ---------- events ----------

test("events: sha256 is deterministic", () => {
  assert.equal(sha256("hello"), sha256("hello"));
  assert.notEqual(sha256("hello"), sha256("hello2"));
});

test("events: idemKey composes entityType:entityId::idempotencyKey", () => {
  assert.equal(idemKey("support_request", "abc-123", "created"), "support_request:abc-123::created");
});

test("events: SCHEMA_VERSION is a stable positive integer", () => {
  assert.equal(typeof SCHEMA_VERSION, "number");
  assert.ok(SCHEMA_VERSION >= 1);
});

// ---------- request-dedup ----------

test("request-dedup: isValidClientRequestId accepts UUID-like tokens", () => {
  assert.equal(isValidClientRequestId("qadedup1783883134abcdef"), true);
  assert.equal(isValidClientRequestId("a1b2c3d4-e5f6-7890"), true);
});

test("request-dedup: isValidClientRequestId rejects too-short/invalid tokens", () => {
  assert.equal(isValidClientRequestId("short"), false);
  assert.equal(isValidClientRequestId(""), false);
  assert.equal(isValidClientRequestId(null), false);
  assert.equal(isValidClientRequestId("has spaces in it 12345"), false);
});

// ---------- projections (pure fold) ----------

test("projections: projectContact folds contact_created then lead_stage_changed", () => {
  const events = [
    { event_type: "contact_created", entity_id: "a@example.com", event_id: "e1", timestamp: "2026-01-01T00:00:00Z", payload: { name: "A" } },
    { event_type: "lead_stage_changed", entity_id: "a@example.com", event_id: "e2", timestamp: "2026-01-01T00:01:00Z", payload: { stage: "validated" } },
  ];
  const contact = projectContact(events);
  assert.equal(contact.stage, "validated");
  assert.equal(contact.lastEventId, "e2");
  assert.equal(contact.consentStatus, "not_collected");
});

test("projections: projectContact returns null when contact_created never happened", () => {
  const events = [
    { event_type: "lead_stage_changed", entity_id: "a@example.com", event_id: "e2", timestamp: "2026-01-01T00:01:00Z", payload: { stage: "validated" } },
  ];
  assert.equal(projectContact(events), null);
});

test("projections: projectContact is order-independent of array order IF pre-sorted by timestamp (fold assumes sorted input)", () => {
  // listEvents() sorts by timestamp before calling projectContact -- this
  // test documents that assumption explicitly, since projectContact
  // itself does NOT re-sort.
  const sorted = [
    { event_type: "contact_created", entity_id: "a@example.com", event_id: "e1", timestamp: "2026-01-01T00:00:00Z", payload: {} },
    { event_type: "lead_stage_changed", entity_id: "a@example.com", event_id: "e2", timestamp: "2026-01-01T00:01:00Z", payload: { stage: "validated" } },
    { event_type: "lead_stage_changed", entity_id: "a@example.com", event_id: "e3", timestamp: "2026-01-01T00:02:00Z", payload: { stage: "customer" } },
  ];
  const contact = projectContact(sorted);
  assert.equal(contact.stage, "customer");
});
