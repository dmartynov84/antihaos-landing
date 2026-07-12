// GET /.netlify/functions/order-status?orderId=...
// Дозволяє тестовій сторінці відновити стан після reload/back — джерело
// істини завжди сервер (Blobs), не localStorage.
"use strict";

const { isOperational, getMode } = require("./_lib/mode");
const { getOrder, listAudit } = require("./_lib/store");
const { withBlobs } = require("./_lib/with-blobs");

exports.handler = withBlobs(async (event) => {
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, body: JSON.stringify({ error: "method_not_allowed" }) };
  }
  if (!isOperational()) {
    return { statusCode: 503, body: JSON.stringify({ error: "checkout_disabled", mode: getMode() }) };
  }

  const orderId = (event.queryStringParameters || {}).orderId;
  if (!orderId) {
    return { statusCode: 400, body: JSON.stringify({ error: "missing_order_id" }) };
  }

  const order = await getOrder(orderId);
  if (!order) {
    return { statusCode: 404, body: JSON.stringify({ error: "order_not_found" }) };
  }

  const audit = await listAudit(orderId);

  return {
    statusCode: 200,
    body: JSON.stringify({
      orderId: order.id,
      packageId: order.packageId,
      amountUah: order.amountUah,
      status: order.status,
      createdAt: order.createdAt,
      paidAt: order.paidAt || null,
      refundedAt: order.refundedAt || null,
      audit,
    }),
  };
});
