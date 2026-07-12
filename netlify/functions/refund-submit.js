// POST /.netlify/functions/refund-submit
// A refund REQUEST, never an automatic approval — status always lands on
// "owner_review", regardless of reason (§20: changed_mind gets no
// automatic legal verdict, same as any other reason). Sandbox only:
// validates against checkout-orders (payment-readiness cycle's store),
// which currently can only contain sandbox/mock orders since live
// payments are blocked.
"use strict";

const { withBlobs } = require("./_lib/with-blobs");
const { newCorrelationId } = require("./_lib/ids");
const { log } = require("./_lib/logger");
const { appendEvent, sha256 } = require("./_lib/events");
const { createWorkflowStatus, markCompleted } = require("./_lib/workflow-status");
const { resolvePublicId, isValidClientRequestId } = require("./_lib/request-dedup");
const { normalizeEmail } = require("./_lib/adapters/crm");
const { getOrder } = require("./_lib/store");
const { getAutomationModes } = require("./_lib/automation-mode");

const REASONS = new Set([
  "access_not_received", "broken_file", "wrong_package", "missing_files",
  "material_mismatch", "duplicate_payment", "changed_mind", "other",
]);
const DEDUP_WINDOW_MINUTES = 10;

exports.handler = withBlobs(async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "method_not_allowed" }) };
  }
  const modes = getAutomationModes();
  if (modes.automation === "disabled") {
    return { statusCode: 503, body: JSON.stringify({ error: "automation_disabled" }) };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: "invalid_json" }) };
  }

  const { email: rawEmail, orderId, reason, description, clientRequestId } = payload;
  if (!rawEmail || !String(rawEmail).includes("@")) {
    return { statusCode: 400, body: JSON.stringify({ error: "invalid_email" }) };
  }
  if (!orderId) {
    return { statusCode: 400, body: JSON.stringify({ error: "missing_order_id" }) };
  }
  if (!REASONS.has(reason)) {
    return { statusCode: 400, body: JSON.stringify({ error: "invalid_reason" }) };
  }

  const email = normalizeEmail(rawEmail);
  const order = await getOrder(orderId);
  if (!order) {
    return { statusCode: 404, body: JSON.stringify({ error: "order_not_found" }) };
  }
  if (normalizeEmail(order.email) !== email) {
    // Не розкриваємо, чи order взагалі існує під іншим email -- та сама
    // 403 незалежно від причини неспівпадіння.
    return { statusCode: 403, body: JSON.stringify({ error: "order_email_mismatch" }) };
  }

  const correlationId = newCorrelationId("refund");
  // client_request_id -- див. support-submit.js для повного пояснення.
  const dedupKey = isValidClientRequestId(clientRequestId)
    ? sha256(`client:refund:${clientRequestId}`)
    : sha256(`${email}|${orderId}|${reason}|${Math.floor(Date.now() / (DEDUP_WINDOW_MINUTES * 60 * 1000))}`);
  const { publicId: requestId, isNew } = await resolvePublicId("refund", dedupKey);

  if (!isNew) {
    log({ event: "refund_request_duplicate", correlationId, entityId: requestId, status: "duplicate" });
    return { statusCode: 200, body: JSON.stringify({ ok: true, requestId, duplicate: true, status: "owner_review" }) };
  }

  await appendEvent({
    eventType: "refund_request_created",
    entityType: "refund_request",
    entityId: requestId,
    correlationId,
    idempotencyKey: requestId,
    source: "refund-form",
    payload: {
      email, orderId, packageId: order.packageId, amountUah: order.amountUah,
      reason, description: String(description || "").trim().slice(0, 2000),
      status: "refund_request_new",
    },
  });
  // Reason зафіксовано з самого початку -- це не рішення, лише
  // класифікація для черги власника/юриста (§20: жодного автоматичного
  // legal verdict за причиною, включно з "changed_mind").
  await appendEvent({
    eventType: "refund_status_changed",
    entityType: "refund_request",
    entityId: requestId,
    correlationId,
    idempotencyKey: "status:owner_review",
    source: "automation",
    payload: { status: "owner_review", reason: "reason_recorded_pending_owner_decision" },
  });

  await createWorkflowStatus(`refund:${requestId}`, { entityType: "refund_request", entityId: requestId });
  await markCompleted(`refund:${requestId}`);

  log({ event: "refund_request_created", correlationId, entityId: requestId, status: "ok", data: { reason, orderId } });

  return { statusCode: 200, body: JSON.stringify({ ok: true, requestId, duplicate: false, status: "owner_review" }) };
});
