// GET/POST /.netlify/functions/ops-duplicates -- admin-only.
// GET: scan support/refund/VIP requests for suspected duplicates (fingerprint
// + time-window, see _lib/duplicate-reconciliation.js) and report each
// candidate's current reconciliation decision (or "suspected_duplicate" if
// none recorded yet -- detection alone never auto-marks a final verdict).
// POST: record a human decision (confirmed_duplicate/linked_to_canonical/
// merged/false_positive). Never deletes or mutates the original events.
"use strict";

const { withBlobs } = require("./_lib/with-blobs");
const { requireAdmin } = require("./_lib/admin-auth");
const { log } = require("./_lib/logger");
const { detectCandidates, recordDecision, getDecision, STATES } = require("./_lib/duplicate-reconciliation");

const ENTITY_TYPES = new Set(["support_request", "refund_request", "vip_workflow"]);

exports.handler = withBlobs(async (event) => {
  const denied = requireAdmin(event);
  if (denied) return denied;

  if (event.httpMethod === "GET") {
    const params = event.queryStringParameters || {};
    const entityType = params.entityType;
    if (!ENTITY_TYPES.has(entityType)) {
      return { statusCode: 400, body: JSON.stringify({ error: "invalid_entity_type", allowed: [...ENTITY_TYPES] }) };
    }
    const windowMinutes = params.windowMinutes ? Number(params.windowMinutes) : 15;
    const candidates = await detectCandidates(entityType, { windowMinutes });
    const withDecisions = await Promise.all(
      candidates.map(async (c) => {
        const decision = await getDecision(entityType, c.entityId);
        return { ...c, currentDecision: decision ? decision.decision : "suspected_duplicate" };
      })
    );
    return { statusCode: 200, body: JSON.stringify({ ok: true, entityType, windowMinutes, count: withDecisions.length, candidates: withDecisions }) };
  }

  if (event.httpMethod === "POST") {
    let payload;
    try {
      payload = JSON.parse(event.body || "{}");
    } catch (e) {
      return { statusCode: 400, body: JSON.stringify({ error: "invalid_json" }) };
    }
    const { entityType, entityId, canonicalEntityId, decision, note } = payload;
    if (!ENTITY_TYPES.has(entityType)) {
      return { statusCode: 400, body: JSON.stringify({ error: "invalid_entity_type", allowed: [...ENTITY_TYPES] }) };
    }
    if (!entityId) return { statusCode: 400, body: JSON.stringify({ error: "missing_entity_id" }) };
    if (!STATES.has(decision)) {
      return { statusCode: 400, body: JSON.stringify({ error: "invalid_decision", allowed: [...STATES] }) };
    }
    const record = await recordDecision({ entityType, entityId, canonicalEntityId, decision, note });
    log({ event: "duplicate_reconciliation_decision", entityId, status: "ok", data: { entityType, decision, canonicalEntityId: canonicalEntityId || null } });
    return { statusCode: 200, body: JSON.stringify({ ok: true, record }) };
  }

  return { statusCode: 405, body: JSON.stringify({ error: "method_not_allowed" }) };
});
