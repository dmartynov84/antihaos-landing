// Структуроване логування, один JSON-рядок на подію (Netlify Function
// logs зчитують stdout/stderr як є — жодного зовнішнього log-провайдера
// не підключено, це свідомо: log-агрегатор — окреме owner-рішення поза
// обсягом цього циклу). НІКОЛИ не логувати secrets/tokens/повний email —
// redact() маскує відомі чутливі поля.
"use strict";

const SENSITIVE_KEYS = new Set([
  "secret", "token", "password", "cvv", "cardnumber", "card_number",
  "webhooksecret", "downloadsecret", "apikey", "api_key", "bearer",
]);

function redactValue(key, value) {
  const lowerKey = key.toLowerCase();
  if (SENSITIVE_KEYS.has(lowerKey) || lowerKey.includes("secret") || lowerKey.includes("token")) {
    return "[redacted]";
  }
  if (lowerKey === "email" && typeof value === "string" && value.includes("@")) {
    const [local, domain] = value.split("@");
    return `${local.slice(0, 2)}***@${domain}`;
  }
  return value;
}

function redact(obj) {
  if (!obj || typeof obj !== "object") return obj;
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k] = typeof v === "object" && v !== null ? redact(v) : redactValue(k, v);
  }
  return out;
}

function log(entry) {
  const record = {
    timestamp: new Date().toISOString(),
    event: entry.event,
    correlation_id: entry.correlationId || null,
    workflow_id: entry.workflowId || null,
    entity_id: entry.entityId || null,
    status: entry.status || null,
    environment: entry.environment || process.env.CONTEXT || "unknown",
    reason_code: entry.reasonCode || null,
    data: redact(entry.data || {}),
  };
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(record));
  return record;
}

module.exports = { log, redact };
