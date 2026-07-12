// GET /.netlify/functions/crm-lookup?email=...
// Internal-only debug endpoint. CRITICAL fix (Automation Operations
// cycle): цей endpoint був публічно доступний без жодної автентифікації
// й повертав повний PII-запис (email, ім'я, UTM, consent, stage) для
// БУДЬ-ЯКОГО вгаданого email — підтверджено живою експлуатацією curl-ом
// перед фіксом. Тепер вимагає X-Admin-Token header, fail-closed без
// ADMIN_TOKEN на Netlify.
//
// Читає з projection-contacts (event-sourced кеш), не зі старого
// crm-contacts store — той більше не заповнюється write-шляхом
// (submission-created.js тепер пише events, projection перебудовується
// з них). Якщо projection відсутня чи застаріла, rebuildContactProjection
// перебудовує її наживо з automation-events (джерело істини).
"use strict";

const { getAutomationModes } = require("./_lib/automation-mode");
const { getContactProjection, rebuildContactProjection } = require("./_lib/projections");
const { normalizeEmail } = require("./_lib/adapters/crm");
const { withBlobs } = require("./_lib/with-blobs");
const { requireAdmin } = require("./_lib/admin-auth");

exports.handler = withBlobs(async (event) => {
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, body: JSON.stringify({ error: "method_not_allowed" }) };
  }
  const denied = requireAdmin(event);
  if (denied) return denied;

  const modes = getAutomationModes();
  if (modes.crm === "disabled") {
    return { statusCode: 503, body: JSON.stringify({ error: "crm_disabled", mode: modes.crm }) };
  }

  const rawEmail = (event.queryStringParameters || {}).email;
  if (!rawEmail) {
    return { statusCode: 400, body: JSON.stringify({ error: "missing_email" }) };
  }
  const email = normalizeEmail(rawEmail);
  const rebuild = (event.queryStringParameters || {}).rebuild === "1";

  const contact = rebuild ? await rebuildContactProjection(email) : await getContactProjection(email);
  if (!contact) {
    return { statusCode: 404, body: JSON.stringify({ error: "not_found" }) };
  }

  return { statusCode: 200, body: JSON.stringify({ contact, projectionRebuilt: rebuild }) };
});
