// POST /.netlify/functions/simulate-pay
// ТІЛЬКИ CHECKOUT_MODE=mock. Немає реального платіжного провайдера —
// цей endpoint будує коректно підписану синтетичну webhook-подію і
// проганяє її через ТОЙ САМИЙ processWebhookEvent, що обробляв би
// справжній provider callback. Кнопка "Pay (test)" на сторінці викликає
// саме це, а не якийсь окремий спрощений шлях.
"use strict";

const crypto = require("crypto");
const { getMode } = require("./_lib/mode");
const { hmacHex } = require("./_lib/security");
const { getOrder } = require("./_lib/store");
const { processWebhookEvent } = require("./_lib/webhook-processor");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "method_not_allowed" }) };
  }
  if (getMode() !== "mock") {
    return { statusCode: 503, body: JSON.stringify({ error: "simulate_pay_only_in_mock_mode", mode: getMode() }) };
  }

  const webhookSecret = process.env.CHECKOUT_WEBHOOK_SECRET;
  const downloadSecret = process.env.CHECKOUT_DOWNLOAD_SECRET;
  if (!webhookSecret || !downloadSecret) {
    return { statusCode: 500, body: JSON.stringify({ error: "secrets_not_configured" }) };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: "invalid_json" }) };
  }

  const { orderId, action } = payload; // action: "pay" | "refund"
  const order = await getOrder(orderId);
  if (!order) {
    return { statusCode: 404, body: JSON.stringify({ error: "order_not_found" }) };
  }

  const syntheticEvent = {
    eventId: crypto.randomUUID(),
    type: action === "refund" ? "refund_succeeded" : "payment_succeeded",
    orderId: order.id,
    amountUah: order.amountUah,
  };
  const rawBody = JSON.stringify(syntheticEvent);
  const signatureHex = hmacHex(webhookSecret, rawBody);

  const result = await processWebhookEvent({ rawBody, signatureHex, webhookSecret, downloadSecret });
  return { statusCode: result.status, body: JSON.stringify(result.body) };
};
