// GET /.netlify/functions/vip-status?workflowId=...
// Same unguessable-ID model. Never sends a dead [CALENDAR_LINK] — while
// calendar_pending, returns an honest note instead (§18, O-06 still open).
"use strict";

const { withBlobs } = require("./_lib/with-blobs");
const { listEvents } = require("./_lib/events");
const { getAutomationModes } = require("./_lib/automation-mode");

exports.handler = withBlobs(async (event) => {
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, body: JSON.stringify({ error: "method_not_allowed" }) };
  }
  const modes = getAutomationModes();
  if (modes.automation === "disabled") {
    return { statusCode: 503, body: JSON.stringify({ error: "automation_disabled" }) };
  }

  const workflowId = (event.queryStringParameters || {}).workflowId;
  if (!workflowId) return { statusCode: 400, body: JSON.stringify({ error: "missing_workflow_id" }) };

  const events = await listEvents("vip_workflow", workflowId);
  if (!events.length) return { statusCode: 404, body: JSON.stringify({ error: "not_found" }) };

  const created = events.find((e) => e.event_type === "vip_workflow_created");
  const latest = [...events].reverse().find((e) => e.payload && e.payload.status);
  const status = latest ? latest.payload.status : created.payload.status;

  const calendarNote =
    status === "calendar_pending"
      ? "Час консультації буде узгоджено окремо — календар ще не підключено."
      : null;

  return {
    statusCode: 200,
    body: JSON.stringify({
      workflowId,
      status,
      entitlementSource: created.payload.entitlementSource,
      createdAt: created.timestamp,
      calendarNote,
    }),
  };
});
