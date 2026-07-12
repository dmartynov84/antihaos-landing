// CHECKOUT_MODE gate. Без env-змінної на Netlify -> "disabled" (безпечний
// дефолт за замовчуванням "з коробки", без потреби пам'ятати вимкнути).
// "live" додатково вимагає CHECKOUT_LIVE_UNLOCK=yes-i-have-owner-and-lawyer-signoff
// як другий, окремий перемикач — сам по собі CHECKOUT_MODE=live його не вмикає.
"use strict";

const VALID_MODES = ["disabled", "mock", "sandbox", "live"];

function getMode() {
  const raw = (process.env.CHECKOUT_MODE || "disabled").trim().toLowerCase();
  return VALID_MODES.includes(raw) ? raw : "disabled";
}

function isLiveUnlocked() {
  return process.env.CHECKOUT_LIVE_UNLOCK === "yes-i-have-owner-and-lawyer-signoff";
}

// Єдина точка правди: чи дозволено обробляти платіж прямо зараз.
function isOperational() {
  const mode = getMode();
  if (mode === "disabled") return false;
  if (mode === "live" && !isLiveUnlocked()) return false;
  return true;
}

module.exports = { getMode, isLiveUnlocked, isOperational, VALID_MODES };
