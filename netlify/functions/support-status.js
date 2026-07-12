// GET /.netlify/functions/support-status?requestId=...
// Public, but "auth" is possession of the unguessable requestId (random
// UUID) issued at submit time — same model as checkout's order-status.js.
// Returns ONLY that request's own data, never a list, never another
// request's data, never full email (masked).
"use strict";

const { withBlobs } = require("./_lib/with-blobs");
const { listEvents } = require("./_lib/events");
const { getAutomationModes } = require("./_lib/automation-mode");

function maskEmail(email) {
  if (!email || !email.includes("@")) return null;
  const [local, domain] = email.split("@");
  return `${local.slice(0, 2)}***@${domain}`;
}

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

  const events = await listEvents("support_request", requestId);
  if (!events.length) {
    return { statusCode: 404, body: JSON.stringify({ error: "not_found" }) };
  }

  const created = events.find((e) => e.event_type === "support_request_created");
  const latestStatusEvent = [...events].reverse().find((e) => e.payload && e.payload.status);
  const status = (latestStatusEvent && latestStatusEvent.payload.status) || (created && created.payload.status) || "unknown";

  return {
    statusCode: 200,
    body: JSON.stringify({
      requestId,
      category: created.payload.category,
      status,
      emailMasked: maskEmail(created.payload.email),
      createdAt: created.timestamp,
    }),
  };
});
