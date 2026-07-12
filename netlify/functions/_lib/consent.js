// Текст згоди — CANDIDATE, не затверджений юристом (docs/checkout-legal-spec.md,
// розділ C). create-order звіряє точний текст, щоб замовлення не пройшло
// без справжньої, неспотвореної згоди. Версії оферти/refund — статичні
// константи; при оновленні публічних сторінок Refund/Offer підняти версію
// тут, щоб старі замовлення зберігали, яку саме редакцію бачив покупець.
"use strict";

const CONSENT_TEXT_CANDIDATE =
  "Я погоджуюсь на негайне надання доступу до цифрових матеріалів і розумію, що це може означати втрату права на відмову від договору протягом 14 днів.";

const OFFER_VERSION = "candidate-2026-07-12";
const REFUND_VERSION = "2026-07-11-erratum";

function isConsentValid(consentGiven, consentText) {
  return consentGiven === true && consentText === CONSENT_TEXT_CANDIDATE;
}

module.exports = { CONSENT_TEXT_CANDIDATE, OFFER_VERSION, REFUND_VERSION, isConsentValid };
