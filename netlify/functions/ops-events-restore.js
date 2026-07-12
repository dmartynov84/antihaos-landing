// POST /.netlify/functions/ops-events-restore -- admin-only.
// Restores a JSONL export into an ISOLATED Blobs store, hardcoded to
// "automation-events-restore-drill" -- NEVER the real "automation-events"
// store, and not a caller-supplied parameter, specifically so a bug in
// the caller (or a copy-pasted wrong argument) cannot accidentally
// overwrite production events. Restoring onto production data is
// explicitly out of scope this cycle and would need separate owner
// approval per docs/automation/restore-procedure.md.
"use strict";

const { getStore } = require("@netlify/blobs");
const { withBlobs } = require("./_lib/with-blobs");
const { requireAdmin } = require("./_lib/admin-auth");
const { log } = require("./_lib/logger");

const RESTORE_DRILL_STORE_NAME = "automation-events-restore-drill";

function restoreDrillStore() {
  return getStore(RESTORE_DRILL_STORE_NAME);
}

exports.handler = withBlobs(async (event) => {
  const denied = requireAdmin(event);
  if (denied) return denied;

  if (event.httpMethod === "GET") {
    const params = event.queryStringParameters || {};
    if (params.action !== "verify") {
      return { statusCode: 400, body: JSON.stringify({ error: "invalid_action", allowed: ["verify"] }) };
    }
    const store = restoreDrillStore();
    const { blobs } = await store.list();
    return { statusCode: 200, body: JSON.stringify({ ok: true, storeName: RESTORE_DRILL_STORE_NAME, count: blobs.length, keys: blobs.map((b) => b.key) }) };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "method_not_allowed" }) };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: "invalid_json" }) };
  }

  const { events } = payload;
  if (!Array.isArray(events) || !events.length) {
    return { statusCode: 400, body: JSON.stringify({ error: "missing_events_array" }) };
  }

  const store = restoreDrillStore();
  let restored = 0;
  for (const envelope of events) {
    if (!envelope.entity_type || !envelope.entity_id || !envelope.idempotency_key) {
      continue; // некоректний запис -- пропускаємо, не падаємо на всьому batch
    }
    const key = `${envelope.entity_type}:${envelope.entity_id}::${envelope.idempotency_key}`;
    await store.setJSON(key, envelope);
    restored++;
  }

  log({ event: "restore_drill_completed", status: "ok", data: { requested: events.length, restored, storeName: RESTORE_DRILL_STORE_NAME } });

  return {
    statusCode: 200,
    body: JSON.stringify({ ok: true, storeName: RESTORE_DRILL_STORE_NAME, requested: events.length, restored }),
  };
});
