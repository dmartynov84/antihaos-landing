// POST /.netlify/functions/create-order
// Створює order (pending). Сума й назва пакета БЕРУТЬСЯ СЕРВЕРОМ з
// _lib/products.js за packageId — клієнт не може вплинути на суму.
// Вимагає валідну згоду (точний поточний CANDIDATE-текст) — без цього
// order не створюється взагалі.
"use strict";

const crypto = require("crypto");
const { isOperational, getMode } = require("./_lib/mode");
const { getProduct } = require("./_lib/products");
const { isConsentValid, OFFER_VERSION, REFUND_VERSION } = require("./_lib/consent");
const { createOrder, appendAudit } = require("./_lib/store");
const { withBlobs } = require("./_lib/with-blobs");

exports.handler = withBlobs(async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "method_not_allowed" }) };
  }
  if (!isOperational()) {
    return { statusCode: 503, body: JSON.stringify({ error: "checkout_disabled", mode: getMode() }) };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: "invalid_json" }) };
  }

  const { packageId, email, consentGiven, consentText } = payload;

  const product = getProduct(packageId);
  if (!product) {
    return { statusCode: 400, body: JSON.stringify({ error: "unknown_package" }) };
  }
  if (!email || typeof email !== "string" || !email.includes("@")) {
    return { statusCode: 400, body: JSON.stringify({ error: "invalid_email" }) };
  }
  if (!isConsentValid(consentGiven, consentText)) {
    return { statusCode: 400, body: JSON.stringify({ error: "consent_required" }) };
  }

  const order = {
    id: crypto.randomUUID(),
    packageId: product.id,
    amountUah: product.amountUah,
    email,
    consentGiven: true,
    consentTextSnapshot: consentText,
    offerVersion: OFFER_VERSION,
    refundVersion: REFUND_VERSION,
    status: "pending",
    mode: getMode(),
    createdAt: new Date().toISOString(),
  };

  await createOrder(order);
  await appendAudit(order.id, "order_created", { packageId: product.id, amountUah: product.amountUah, mode: getMode() });

  return {
    statusCode: 200,
    body: JSON.stringify({ orderId: order.id, packageId: product.id, amountUah: product.amountUah, mode: getMode() }),
  };
});
