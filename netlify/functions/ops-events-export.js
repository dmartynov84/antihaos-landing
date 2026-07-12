// GET /.netlify/functions/ops-events-export?entityType=... -- admin-only.
// FULL export of raw events (including payload -- real PII) for exactly
// one entity type, meant to be consumed ONLY by the local backup script
// (tools/ops-backup.py) over HTTPS with the admin token. Never public,
// never cached, never written to any file that gets committed --
// enforced by policy (docs/automation/backup-policy-draft.md) and by
// .gitignore on the local backup output directory, not by this endpoint
// itself (it cannot know what the caller does with the response).
"use strict";

const { withBlobs } = require("./_lib/with-blobs");
const { requireAdmin } = require("./_lib/admin-auth");
const { listEntityIds, listEvents } = require("./_lib/events");
const { log } = require("./_lib/logger");

const ENTITY_TYPES = new Set(["contact", "support_request", "refund_request", "vip_workflow"]);

exports.handler = withBlobs(async (event) => {
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, body: JSON.stringify({ error: "method_not_allowed" }) };
  }
  const denied = requireAdmin(event);
  if (denied) return denied;

  const entityType = (event.queryStringParameters || {}).entityType;
  if (!ENTITY_TYPES.has(entityType)) {
    return { statusCode: 400, body: JSON.stringify({ error: "invalid_entity_type", allowed: [...ENTITY_TYPES] }) };
  }

  const entityIds = await listEntityIds(entityType);
  const allEvents = [];
  for (const entityId of entityIds) {
    const events = await listEvents(entityType, entityId);
    allEvents.push(...events);
  }

  log({ event: "ops_events_exported", status: "ok", data: { entityType, entityCount: entityIds.length, eventCount: allEvents.length } });

  return {
    statusCode: 200,
    body: JSON.stringify({ ok: true, entityType, entityCount: entityIds.length, eventCount: allEvents.length, events: allEvents }),
  };
});
