// Класичні exports.handler-функції (V1) виконуються в "Lambda
// compatibility mode" — Netlify НЕ інжектить siteID/token для
// @netlify/blobs автоматично, як робить це для V2-функцій. Без явного
// connectLambda(event) кожен getStore() кидає MissingBlobsEnvironmentError.
// Знайдено ЛИШЕ завдяки crm-lookup.js (без власного try/catch) — усі
// checkout-функції з попереднього циклу мовчали про цю саму помилку,
// бо CHECKOUT_MODE=disabled завжди повертався РАНІШЕ, ніж код доходив
// до getStore(). Обгортка гарантує, що жоден новий handler не забуде
// це зробити.
"use strict";

const { connectLambda } = require("@netlify/blobs");

function withBlobs(handler) {
  return async (event, context) => {
    connectLambda(event);
    return handler(event, context);
  };
}

module.exports = { withBlobs };
