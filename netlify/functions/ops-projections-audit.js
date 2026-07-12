// GET/POST /.netlify/functions/ops-projections-audit -- admin-only.
// GET ?action=check -- scans every contact projection, reports in_sync /
//   drift_detected / unknown_schema_version, changes NOTHING.
// POST {action:"rebuild", email} -- rebuilds ONE contact's projection
//   (deterministic, from events -- see _lib/projections.js). Requires the
//   caller to have already seen the diff via check (this endpoint does not
//   auto-rebuild everything blindly -- explicit target per call, no
//   surprise mass rewrite).
// POST {action:"rebuild-all"} -- rebuilds every drifted contact found by a
//   fresh check pass. Reports what was rebuilt; skips (does not touch)
//   any unknown_schema_version contact -- fail loud, not guess.
"use strict";

const { withBlobs } = require("./_lib/with-blobs");
const { requireAdmin } = require("./_lib/admin-auth");
const { log } = require("./_lib/logger");
const { auditContactProjection, listAllContactEmails, rebuildContactProjection } = require("./_lib/projections");

async function runFullCheck() {
  const emails = await listAllContactEmails();
  const results = await Promise.all(emails.map((email) => auditContactProjection(email)));
  return results;
}

exports.handler = withBlobs(async (event) => {
  const denied = requireAdmin(event);
  if (denied) return denied;

  if (event.httpMethod === "GET") {
    const action = (event.queryStringParameters || {}).action || "check";
    if (action !== "check") {
      return { statusCode: 400, body: JSON.stringify({ error: "invalid_action", allowed: ["check"] }) };
    }
    const results = await runFullCheck();
    const summary = { in_sync: 0, drift_detected: 0, unknown_schema_version: 0 };
    for (const r of results) summary[r.status] = (summary[r.status] || 0) + 1;
    return { statusCode: 200, body: JSON.stringify({ ok: true, total: results.length, summary, results }) };
  }

  if (event.httpMethod === "POST") {
    let payload;
    try {
      payload = JSON.parse(event.body || "{}");
    } catch (e) {
      return { statusCode: 400, body: JSON.stringify({ error: "invalid_json" }) };
    }

    if (payload.action === "rebuild") {
      if (!payload.email) return { statusCode: 400, body: JSON.stringify({ error: "missing_email" }) };
      const before = await auditContactProjection(payload.email);
      if (before.status === "unknown_schema_version") {
        return { statusCode: 409, body: JSON.stringify({ error: "unknown_schema_version", detail: before }) };
      }
      const rebuilt = await rebuildContactProjection(payload.email);
      log({ event: "projection_rebuilt", entityId: payload.email, status: "ok", data: { previousStatus: before.status } });
      return { statusCode: 200, body: JSON.stringify({ ok: true, rebuilt: !!rebuilt, previousStatus: before.status }) };
    }

    if (payload.action === "rebuild-all") {
      const results = await runFullCheck();
      const drifted = results.filter((r) => r.status === "drift_detected");
      const skippedUnknownSchema = results.filter((r) => r.status === "unknown_schema_version");
      const rebuilt = [];
      for (const r of drifted) {
        await rebuildContactProjection(r.email);
        rebuilt.push(r.email);
      }
      log({ event: "projection_rebuild_all", status: "ok", data: { rebuiltCount: rebuilt.length, skippedUnknownSchemaCount: skippedUnknownSchema.length } });
      return {
        statusCode: 200,
        body: JSON.stringify({
          ok: true,
          rebuiltCount: rebuilt.length,
          skippedUnknownSchemaCount: skippedUnknownSchema.length,
          skippedUnknownSchema: skippedUnknownSchema.map((r) => r.email),
        }),
      };
    }

    return { statusCode: 400, body: JSON.stringify({ error: "invalid_action", allowed: ["rebuild", "rebuild-all"] }) };
  }

  return { statusCode: 405, body: JSON.stringify({ error: "method_not_allowed" }) };
});
