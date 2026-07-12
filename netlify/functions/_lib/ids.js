// Correlation ID — один на весь ланцюжок обробки однієї події (форма,
// webhook тощо), щоб можна було прослідкувати "ланцюжок" у логах.
"use strict";

const crypto = require("crypto");

function newCorrelationId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${crypto.randomBytes(6).toString("hex")}`;
}

module.exports = { newCorrelationId };
