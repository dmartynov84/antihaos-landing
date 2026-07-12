// GET /.netlify/functions/crm-lookup?email=...
// Внутрішній debug-endpoint, ЛИШЕ для перевірки цього циклу — дозволяє
// підтвердити, що submission-created.js справді записав контакт у mock
// CRM, а не просто повернув 200 без реальної дії (той самий клас
// перевірки, що order-status.js дає для checkout-контуру). Читає лише
// mock-дані (Netlify Blobs), жодних реальних платіжних чи карткових
// даних тут немає за конструкцією.
"use strict";

const { getAutomationModes } = require("./_lib/automation-mode");
const crm = require("./_lib/adapters/crm");
const { withBlobs } = require("./_lib/with-blobs");

exports.handler = withBlobs(async (event) => {
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, body: JSON.stringify({ error: "method_not_allowed" }) };
  }
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
