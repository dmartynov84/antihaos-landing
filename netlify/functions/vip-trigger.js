// POST /.netlify/functions/vip-trigger
// Starts a VIP workflow. Entitlement can ONLY come from (a) a paid VIP
// sandbox order (checkout-orders store, packageId="vip", status="paid")
// or (b) an admin-authenticated test entitlement — never a browser query
// parameter, per §18. Duplicate triggers for the same order/test-seed
// return the existing workflowId instead of creating a second workflow.
"use strict";

const { withBlobs } = require("./_lib/with-blobs");
const { requireAdmin } = require("./_lib/admin-auth");
const { newCorrelationId } = require("./_lib/ids");
const { log } = require("./_lib/logger");
const { appendEvent } = require("./_lib/events");
const { resolvePublicId } = require("./_lib/request-dedup");
const { createWorkflowStatus, markCompleted } = require("./_lib/workflow-status");
const { normalizeEmail } = require("./_lib/adapters/crm");
const { getOrder } = require("./_lib/store");
const { getAutomationModes } = require("./_lib/automation-mode");

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

  const { email: rawEmail, orderId, testEntitlement } = payload;
  if (!rawEmail || !String(rawEmail).includes("@")) {
    return { statusCode: 400, body: JSON.stringify({ error: "invalid_email" }) };
  }
  const email = normalizeEmail(rawEmail);

  let entitlementSource;
  let dedupSeed;

  if (testEntitlement) {
    const denied = requireAdmin(event);
    if (denied) return denied;
    entitlementSource = "admin_test_entitlement";
    dedupSeed = `test:${email}:${orderId || "no-order"}`;
  } else {
    if (!orderId) {
      return { statusCode: 400, body: JSON.stringify({ error: "missing_order_id" }) };
    }
    const order = await getOrder(orderId);
    if (!order) return { statusCode: 404, body: JSON.stringify({ error: "order_not_found" }) };
    if (order.packageId !== "vip") return { statusCode: 403, body: JSON.stringify({ error: "not_vip_package" }) };
    if (order.status !== "paid") return { statusCode: 403, body: JSON.stringify({ error: "order_not_paid" }) };
    if (normalizeEmail(order.email) !== email) return { statusCode: 403, body: JSON.stringify({ error: "order_email_mismatch" }) };
    entitlementSource = "sandbox_order";
    dedupSeed = `order:${orderId}`;
  }

  const correlationId = newCorrelationId("vip");
  const { publicId: workflowId, isNew } = await resolvePublicId("vip", dedupSeed);

  if (!isNew) {
    log({ event: "vip_workflow_duplicate_trigger", correlationId, entityId: workflowId, status: "duplicate" });
    return { statusCode: 200, body: JSON.stringify({ ok: true, workflowId, duplicate: true }) };
  }

  await appendEvent({
    eventType: "vip_workflow_created", entityType: "vip_workflow", entityId: workflowId,
    correlationId, idempotencyKey: "created", source: entitlementSource,
    payload: { email, orderId: orderId || null, entitlementSource, status: "vip_new" },
  });
  await appendEvent({
    eventType: "vip_status_changed", entityType: "vip_workflow", entityId: workflowId,
    correlationId, idempotencyKey: "status:entitlement_pending", source: "automation",
    payload: { status: "entitlement_pending" },
  });
  await appendEvent({
    eventType: "vip_status_changed", entityType: "vip_workflow", entityId: workflowId,
    correlationId, idempotencyKey: "status:intake_pending", source: "automation",
    payload: { status: "intake_pending" },
  });

  await createWorkflowStatus(`vip:${workflowId}`, { entityType: "vip_workflow", entityId: workflowId });
  await markCompleted(`vip:${workflowId}`);

  log({ event: "vip_workflow_created", correlationId, entityId: workflowId, status: "ok", data: { entitlementSource } });

  return { statusCode: 200, body: JSON.stringify({ ok: true, workflowId, duplicate: false, status: "intake_pending" }) };
});
