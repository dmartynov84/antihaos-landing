// POST /.netlify/functions/vip-intake  { workflowId, intake: {...} }
// Enforces the state machine explicitly — submitting intake when the
// workflow isn't actually in intake_pending (e.g. already received, or
// cancelled) is rejected with 409, not silently accepted.
"use strict";

const { withBlobs } = require("./_lib/with-blobs");
const { newCorrelationId } = require("./_lib/ids");
const { log } = require("./_lib/logger");
const { appendEvent, listEvents } = require("./_lib/events");
const { canTransition } = require("./_lib/vip-state-machine");
const { getAutomationModes } = require("./_lib/automation-mode");

function currentStatus(events) {
  const latest = [...events].reverse().find((e) => e.payload && e.payload.status);
  return latest ? latest.payload.status : null;
}

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
  const { workflowId, intake } = payload;
  if (!workflowId) return { statusCode: 400, body: JSON.stringify({ error: "missing_workflow_id" }) };
  if (!intake || typeof intake !== "object") return { statusCode: 400, body: JSON.stringify({ error: "missing_intake" }) };

  const events = await listEvents("vip_workflow", workflowId);
  if (!events.length) return { statusCode: 404, body: JSON.stringify({ error: "workflow_not_found" }) };

  const status = currentStatus(events);
  if (!canTransition(status, "intake_received")) {
    return { statusCode: 409, body: JSON.stringify({ error: "invalid_transition", from: status, to: "intake_received" }) };
  }

  const correlationId = newCorrelationId("vip-intake");
  await appendEvent({
    eventType: "vip_intake_received", entityType: "vip_workflow", entityId: workflowId,
    correlationId, idempotencyKey: "intake_received", source: "vip-intake-form",
    payload: { intake },
  });
  await appendEvent({
    eventType: "vip_status_changed", entityType: "vip_workflow", entityId: workflowId,
    correlationId, idempotencyKey: "status:intake_received", source: "automation",
    payload: { status: "intake_received" },
  });
  await appendEvent({
    eventType: "vip_status_changed", entityType: "vip_workflow", entityId: workflowId,
    correlationId, idempotencyKey: "status:audit_pending", source: "automation",
    payload: { status: "audit_pending" },
  });

  log({ event: "vip_intake_received", correlationId, entityId: workflowId, status: "ok" });
  return { statusCode: 200, body: JSON.stringify({ ok: true, workflowId, status: "audit_pending" }) };
});
