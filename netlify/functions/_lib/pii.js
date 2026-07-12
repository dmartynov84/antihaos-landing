// Спільна PII-маскування для операційних інструментів (ops-report-data,
// ops-duplicates відповіді, локальний owner-звіт). Той самий формат, що
// вже використовується в support-status.js/_lib/logger.js -- НЕ
// дублюється логіка маскування, лише винесена сюди для нового коду.
"use strict";

function maskEmail(email) {
  if (!email || !String(email).includes("@")) return null;
  const [local, domain] = String(email).split("@");
  return `${local.slice(0, 2)}***@${domain}`;
}

module.exports = { maskEmail };
