// GET/POST /.netlify/functions/ops-dead-letter -- admin-only.
// GET ?action=list -- all dead_letter + retry_scheduled workflows (summary).
// GET ?action=inspect&workflowId=... -- one workflow's status + its event
//   history (masked, no raw email/PII).
// POST {action:"cancel", workflowId, reasonCode} -- marks cancelled, does
//   NOT delete anything. Replay stays on the existing replay-workflow.js
//   endpoint (separate, already-shipped, already-tested) -- not duplicated
//   here.
//
// Known gap, disclosed rather than silently implied away: only the lead
// pipeline (submission-created.js -> lead-processor.js) currently has a
// real failure path that can produce retry_scheduled/dead_letter.
// support-submit.js/refund-submit.js/vip-trigger.js call markCompleted
// unconditionally right after appendEvent succeeds -- if appendEvent
// itself throws, the function 500s before createWorkflowStatus even runs,
// so those three workflows cannot currently reach dead_letter through
// this tool. Documented in docs/automation/owner-operations.md, not
// silently fixed this cycle (would touch three already-verified endpoints
// without a task-scoped reason to).
"use strict";

const { withBlobs } = require("./_lib/with-blobs");
const { requireAdmin } = require("./_lib/admin-auth");
const { log } = require("./_lib/logger");
const { listAllWorkflows, getWorkflowStatus, markCancelled } = require("./_lib/workflow-status");
const { listEvents } = require("./_lib/events");

exports.handler = withBlobs(async (event) => {
  const denied = requireAdmin(event);
  if (denied) return denied;

  if (event.httpMethod === "GET") {
    const params = event.queryStringParameters || {};
    const action = params.action || "list";

    if (action === "list") {
      const all = await listAllWorkflows();
      const relevant = all.filter((w) => w.status === "dead_letter" || w.status === "retry_scheduled");
      return {
        statusCode: 200,
        body: JSON.stringify({
          ok: true,
          count: relevant.length,
          workflows: relevant.map((w) => ({
            workflowId: w.workflowId, status: w.status, retryCount: w.retryCount,
            lastErrorCode: w.lastErrorCode, nextRetryAt: w.nextRetryAt, updatedAt: w.updatedAt,
          })),
        }),
      };
    }

    if (action === "inspect") {
      const workflowId = params.workflowId;
      if (!workflowId) return { statusCode: 400, body: JSON.stringify({ error: "missing_workflow_id" }) };
      const status = await getWorkflowStatus(workflowId);
      if (!status) return { statusCode: 404, body: JSON.stringify({ error: "workflow_not_found" }) };
      const { entityType, entityId } = status.meta || {};
      const events = entityType && entityId ? await listEvents(entityType, entityId) : [];
      return {
        statusCode: 200,
        body: JSON.stringify({
          ok: true,
          status,
          eventCount: events.length,
          eventTypes: events.map((e) => ({ eventType: e.event_type, timestamp: e.timestamp, status: e.status })),
        }),
      };
    }

    return { statusCode: 400, body: JSON.stringify({ error: "invalid_action", allowed: ["list", "inspect"] }) };
  }

  if (event.httpMethod === "POST") {
    let payload;
    try {
      payload = JSON.parse(event.body || "{}");
    } catch (e) {
      return { statusCode: 400, body: JSON.stringify({ error: "invalid_json" }) };
    }
    if (payload.action !== "cancel") {
      return { statusCode: 400, body: JSON.stringify({ error: "invalid_action", allowed: ["cancel"] }) };
    }
    const { workflowId, reasonCode } = payload;
    if (!workflowId) return { statusCode: 400, body: JSON.stringify({ error: "missing_workflow_id" }) };
    const current = await getWorkflowStatus(workflowId);
    if (!current) return { statusCode: 404, body: JSON.stringify({ error: "workflow_not_found" }) };
    const result = await markCancelled(workflowId, reasonCode || "owner_cancelled");
    log({ event: "workflow_cancelled_by_owner", workflowId, status: result.status, reasonCode: reasonCode || "owner_cancelled" });
    return { statusCode: 200, body: JSON.stringify({ ok: true, status: result.status }) };
  }

  return { statusCode: 405, body: JSON.stringify({ error: "method_not_allowed" }) };
});
