// GET /.netlify/functions/crm-lookup?email=...
// Internal-only debug endpoint. CRITICAL fix (Automation Operations
// cycle): цей endpoint був публічно доступний без жодної автентифікації
// й повертав повний PII-запис (email, ім'я, UTM, consent, stage) для
// БУДЬ-ЯКОГО вгаданого email — підтверджено живою експлуатацією curl-ом
// перед фіксом. Тепер вимагає X-Admin-Token header, fail-closed без
// ADMIN_TOKEN на Netlify.
"use strict";

const { getAutomationModes } = require("./_lib/automation-mode");
const crm = require("./_lib/adapters/crm");
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

  const email = (event.queryStringParameters || {}).email;
  if (!email) {
    return { statusCode: 400, body: JSON.stringify({ error: "missing_email" }) };
  }

  const contact = await crm.findByEmail(email);
  if (!contact) {
    return { statusCode: 404, body: JSON.stringify({ error: "not_found" }) };
  }

  return { statusCode: 200, body: JSON.stringify({ contact }) };
});
