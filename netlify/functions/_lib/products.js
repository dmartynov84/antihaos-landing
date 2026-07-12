// Єдине СЕРВЕРНЕ джерело істини для ціни й складу пакета. Навмисно
// ізольоване від js/product-data.js (той файл — лише для UI-панелей
// на сторінці, не авторитетний для суми оплати). Клієнт передає лише
// packageId; сума й назва завжди беруться звідси, ніколи з frontend.
"use strict";

const PRODUCTS = Object.freeze({
  starter: Object.freeze({ id: "starter", title: "Starter", amountUah: 1490, files: ["sandbox-placeholder"] }),
  pro: Object.freeze({ id: "pro", title: "Pro", amountUah: 4900, files: ["sandbox-placeholder"] }),
  vip: Object.freeze({ id: "vip", title: "VIP", amountUah: 9900, files: ["sandbox-placeholder"] }),
});

function getProduct(packageId) {
  return PRODUCTS[packageId] || null;
}

module.exports = { PRODUCTS, getProduct };
