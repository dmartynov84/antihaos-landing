// Єдине СЕРВЕРНЕ джерело істини для ціни й складу пакета. Навмисно
// ізольоване від js/product-data.js (той файл — лише для UI-панелей
// на сторінці, не авторитетний для суми оплати). Клієнт передає лише
// packageId; сума й назва завжди беруться звідси, ніколи з frontend.
//
// Ціни звірені вручну проти antyhaos-marketing/delivery/delivery-manifest.json
// (окремий репозиторій, не читається програмно в рантаймі — не той самий
// деплой) станом на 2026-07-12: starter=1490, pro=4900, vip=9900 — збігається.
// entitlement.files — sandbox-заглушка (те саме обмеження, що й у
// попередньому payment-readiness циклі: реальні PRO/VIP/Starter файли не
// задеплоєні на Netlify, окремий owner blocker O-07).
"use strict";

const PRODUCTS = Object.freeze({
  starter: Object.freeze({
    id: "starter", title: "Starter", amountUah: 1490, active: true,
    files: ["sandbox-placeholder"],
    entitlement: "starter",
  }),
  pro: Object.freeze({
    id: "pro", title: "Pro", amountUah: 4900, active: true,
    files: ["sandbox-placeholder"],
    entitlement: "pro", // включає starter -- реальна ієрархія доступу лишається owner/engineer рішенням разом із O-07
  }),
  vip: Object.freeze({
    id: "vip", title: "VIP", amountUah: 9900, active: true,
    files: ["sandbox-placeholder"],
    entitlement: "vip", // VIP -- service upgrade, не готовий файловий пакет (підтверджено раніше сесією) -- checkout-контур цього не змінює
  }),
});

function getProduct(packageId) {
  return PRODUCTS[packageId] || null;
}

module.exports = { PRODUCTS, getProduct };
