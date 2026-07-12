// POST /.netlify/functions/support-submit
// Support workflow, mock mode. requestId returned to the client is a
// random UUID (see _lib/request-dedup.js) — not the internal dedup hash
// — so it can't be recomputed by a third party who happens to know the
// submitter's email and roughly what they wrote.
"use strict";

const { withBlobs } = require("./_lib/with-blobs");
const { newCorrelationId } = require("./_lib/ids");
const { log } = require("./_lib/logger");
const { appendEvent, sha256 } = require("./_lib/events");
const { createWorkflowStatus, markCompleted } = require("./_lib/workflow-status");
const { resolvePublicId, isValidClientRequestId } = require("./_lib/request-dedup");
const { normalizeEmail } = require("./_lib/adapters/crm");
const { getAutomationModes } = require("./_lib/automation-mode");

const CATEGORIES = new Set(["access", "broken_file", "wrong_package", "payment", "refund", "vip", "technical", "general"]);
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

  const { email: rawEmail, category, description, orderId, packageId, clientRequestId } = payload;
  if (!rawEmail || !String(rawEmail).includes("@")) {
    return { statusCode: 400, body: JSON.stringify({ error: "invalid_email" }) };
  }
  if (!CATEGORIES.has(category)) {
    return { statusCode: 400, body: JSON.stringify({ error: "invalid_category" }) };
  }
  const trimmedDescription = String(description || "").trim();
  if (trimmedDescription.length < 5) {
    return { statusCode: 400, body: JSON.stringify({ error: "description_too_short" }) };
  }

  const email = normalizeEmail(rawEmail);
  const correlationId = newCorrelationId("support");
  // client_request_id (§ Owner Operations цикл): якщо клієнт передав
  // стабільний ID, згенерований один раз і повторно використаний при
  // retry/reload (automation-test.html: localStorage), dedup йде саме за
  // ним -- надійніше за контентний хеш, бо не залежить від того, чи текст
  // лишився дослівно тим самим. ЗНИЖУЄ, але НЕ усуває ризик дублю -- нова
  // вкладка/пристрій/очищене сховище дають новий ID (див.
  // docs/automation/consistency-contracts.md).
  const dedupKey = isValidClientRequestId(clientRequestId)
    ? sha256(`client:support:${clientRequestId}`)
    : sha256(`${email}|${category}|${sha256(trimmedDescription.toLowerCase())}|${Math.floor(Date.now() / (DEDUP_WINDOW_MINUTES * 60 * 1000))}`);

  const { publicId: requestId, isNew } = await resolvePublicId("support", dedupKey);

  if (!isNew) {
    log({ event: "support_request_duplicate", correlationId, entityId: requestId, status: "duplicate", reasonCode: "dedup_window_hit" });
    return { statusCode: 200, body: JSON.stringify({ ok: true, requestId, duplicate: true, status: "new" }) };
  }

  await appendEvent({
    eventType: "support_request_created",
    entityType: "support_request",
    entityId: requestId,
    correlationId,
    idempotencyKey: requestId,
    source: "support-form",
    payload: {
      email, category,
      description: trimmedDescription.slice(0, 2000),
      orderId: orderId || null,
      packageId: packageId || null,
      status: "new",
      // Service request -- НЕ маркетингова згода (§21). Ніколи не
      // "granted" через сам факт звернення.
      marketingConsentStatus: "not_collected",
    },
  });

  await createWorkflowStatus(`support:${requestId}`, { entityType: "support_request", entityId: requestId });
  await markCompleted(`support:${requestId}`);

  log({ event: "support_request_created", correlationId, entityId: requestId, status: "ok", data: { category } });

  return { statusCode: 200, body: JSON.stringify({ ok: true, requestId, duplicate: false, status: "new" }) };
});
