// POST /.netlify/functions/webhook
// РЕАЛЬНИЙ endpoint для майбутнього платіжного провайдера. Підпис
// перевіряється з CHECKOUT_WEBHOOK_SECRET (env, лише на сервері — ніколи
// не потрапляє у frontend). Без секрету на Netlify -> fail-closed 500,
// не fallback на якийсь дефолтний секрет.
"use strict";

const { isOperational, getMode } = require("./_lib/mode");
const { processWebhookEvent } = require("./_lib/webhook-processor");
const { withBlobs } = require("./_lib/with-blobs");

exports.handler = withBlobs(async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "method_not_allowed" }) };
  }
  if (!isOperational()) {
    return { statusCode: 503, body: JSON.stringify({ error: "checkout_disabled", mode: getMode() }) };
  }

  const signatureHex = event.headers["x-checkout-signature"] || event.headers["X-Checkout-Signature"];
  const rawBody = event.body || "";

  const result = await processWebhookEvent({
    rawBody,
    signatureHex,
    webhookSecret: process.env.CHECKOUT_WEBHOOK_SECRET,
    downloadSecret: process.env.CHECKOUT_DOWNLOAD_SECRET,
  });

  return { statusCode: result.status, body: JSON.stringify(result.body) };
});
