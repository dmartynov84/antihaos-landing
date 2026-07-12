// POST /.netlify/functions/replay-workflow  { "workflowId": "lead:..." }
// Authenticated (X-Admin-Token) manual replay for a retry_scheduled or
// dead_letter workflow. No scheduled/cron auto-retry exists this cycle
// (deliberately not built without being able to verify Netlify Scheduled
// Functions live -- see docs/runbooks/replay-dead-letter.md) -- this is
// the actual recovery mechanism. Idempotent: replaying an already-
// completed or already-replayed workflow is a safe no-op, not a
// re-send.
"use strict";

const { requireAdmin } = require("./_lib/admin-auth");
const { withBlobs } = require("./_lib/with-blobs");
const { getWorkflowStatus, markProcessing, markFailure, markManuallyReplayed } = require("./_lib/workflow-status");
const { listEvents } = require("./_lib/events");
const { processLeadEvent } = require("./_lib/lead-processor");
const { log } = require("./_lib/logger");
const { newCorrelationId } = require("./_lib/ids");

const TERMINAL_SUCCESS_STATES = new Set(["completed", "manually_replayed"]);

exports.handler = withBlobs(async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "method_not_allowed" }) };
  }
  const denied = requireAdmin(event);
  if (denied) return denied;

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: "invalid_json" }) };
  }

  const { workflowId } = payload;
  if (!workflowId) {
    return { statusCode: 400, body: JSON.stringify({ error: "missing_workflow_id" }) };
  }

  const correlationId = newCorrelationId("replay");
  const status = await getWorkflowStatus(workflowId);
  if (!status) {
    return { statusCode: 404, body: JSON.stringify({ error: "workflow_not_found" }) };
  }
  if (TERMINAL_SUCCESS_STATES.has(status.status)) {
    log({ event: "workflow_replay_noop", correlationId, workflowId, status: status.status, reasonCode: "already_terminal" });
    return { statusCode: 200, body: JSON.stringify({ ok: true, alreadyDone: true, status: status.status }) };
  }
  if (status.status === "cancelled") {
    return { statusCode: 409, body: JSON.stringify({ error: "workflow_cancelled" }) };
  }

  const { entityType, entityId } = status.meta || {};
  if (!entityType || !entityId) {
    return { statusCode: 500, body: JSON.stringify({ error: "workflow_missing_entity_reference" }) };
  }

  const events = await listEvents(entityType, entityId);
  const sourceEvent = events.find((e) => e.workflow_id === workflowId && e.event_type === "lead_submitted");
  if (!sourceEvent) {
    return { statusCode: 404, body: JSON.stringify({ error: "source_event_not_found" }) };
  }

  await markProcessing(workflowId);
  try {
    await processLeadEvent(sourceEvent);
    const result = await markManuallyReplayed(workflowId);
    log({ event: "workflow_replayed", correlationId, workflowId, entityId, status: result.status });
    return { statusCode: 200, body: JSON.stringify({ ok: true, status: result.status }) };
  } catch (err) {
    const result = await markFailure(workflowId, "storage_temporary_failure");
    log({
      event: "workflow_replay_failed", correlationId, workflowId, entityId,
      status: result ? result.status : "failed",
      data: { message: String(err && err.message) },
    });
    return { statusCode: 500, body: JSON.stringify({ ok: false, status: result ? result.status : "failed" }) };
  }
});
