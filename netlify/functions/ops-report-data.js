// GET /.netlify/functions/ops-report-data -- admin-only, PII-minimal
// aggregate. This is the ONE data source for both the local owner-ops
// report generator (tools/ops-report.py) and the local daily digest --
// never deployed as a public page itself (§ task: no public admin
// dashboard without a confirmed auth provider). Returns counts and
// masked identifiers only, never full email/PII, never raw event payloads.
"use strict";

const { withBlobs } = require("./_lib/with-blobs");
const { requireAdmin } = require("./_lib/admin-auth");
const { getAutomationModes } = require("./_lib/automation-mode");
const { listAllWorkflows } = require("./_lib/workflow-status");
const { classifyStaleness } = require("./_lib/stale-detection");
const { detectCandidates } = require("./_lib/duplicate-reconciliation");
const { listEntityIds, listEvents } = require("./_lib/events");

const ENTITY_TYPES = ["support_request", "refund_request", "vip_workflow"];
const CREATION_EVENT_TYPES = {
  support_request: "support_request_created",
  refund_request: "refund_request_created",
  vip_workflow: "vip_workflow_created",
};

async function summarizeEntityType(entityType) {
  const ids = await listEntityIds(entityType);
  let statusCounts = {};
  for (const id of ids) {
    const events = await listEvents(entityType, id);
    const latest = [...events].reverse().find((e) => e.payload && e.payload.status);
    const status = (latest && latest.payload.status) || "unknown";
    statusCounts[status] = (statusCounts[status] || 0) + 1;
  }
  return { total: ids.length, byStatus: statusCounts };
}

exports.handler = withBlobs(async (event) => {
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, body: JSON.stringify({ error: "method_not_allowed" }) };
  }
  const denied = requireAdmin(event);
  if (denied) return denied;

  const modes = getAutomationModes();
  const workflows = await listAllWorkflows();

  const workflowCounts = {};
  const deadLetter = [];
  const stale = [];
  for (const w of workflows) {
    workflowCounts[w.status] = (workflowCounts[w.status] || 0) + 1;
    if (w.status === "dead_letter") {
      deadLetter.push({ workflowId: w.workflowId, lastErrorCode: w.lastErrorCode, retryCount: w.retryCount, updatedAt: w.updatedAt });
    }
    const staleInfo = classifyStaleness(w);
    if (staleInfo) stale.push(staleInfo);
  }

  const entitySummaries = {};
  for (const et of ENTITY_TYPES) {
    entitySummaries[et] = await summarizeEntityType(et);
  }

  const duplicateCandidates = {};
  for (const et of ENTITY_TYPES) {
    const candidates = await detectCandidates(et, { windowMinutes: 15 });
    duplicateCandidates[et] = candidates.length;
  }

  return {
    statusCode: 200,
    body: JSON.stringify({
      ok: true,
      generatedAt: new Date().toISOString(),
      modes,
      workflowCounts,
      deadLetterCount: deadLetter.length,
      deadLetter,
      staleCount: stale.length,
      stale,
      entitySummaries,
      duplicateCandidateCounts: duplicateCandidates,
      note: "PII-minimal: без email/raw payload. Для деталей -- crm-lookup/ops-duplicates окремо, теж authenticated.",
    }),
  };
});
