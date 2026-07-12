// GET /.netlify/functions/refund-status?requestId=...
// Same unguessable-ID model as support-status.js.
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

  const requestId = (event.queryStringParameters || {}).requestId;
  if (!requestId) {
    return { statusCode: 400, body: JSON.stringify({ error: "missing_request_id" }) };
  }

  const events = await listEvents("refund_request", requestId);
  if (!events.length) {
    return { statusCode: 404, body: JSON.stringify({ error: "not_found" }) };
  }

  const created = events.find((e) => e.event_type === "refund_request_created");
  const latestStatus = [...events].reverse().find((e) => e.payload && e.payload.status);
  const status = (latestStatus && latestStatus.payload.status) || created.payload.status;

  return {
    statusCode: 200,
    body: JSON.stringify({
      requestId,
      orderId: created.payload.orderId,
      packageId: created.payload.packageId,
      reason: created.payload.reason,
      status,
      createdAt: created.timestamp,
      note: "Запит отримано й передано на перевірку. Це не автоматичне схвалення повернення.",
    }),
  };
});
