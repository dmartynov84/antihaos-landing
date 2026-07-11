(function () {
  // UX-INTERACTION FIX: та сама grid-template-rows-accordion техніка, що й
  // у step-accordion.js (SITE-1.13) — навмисно однаковий патерн взаємодії
  // на всій сторінці. Деталі рендеряться лінива, з ANTIHAOS_PRODUCTS, один
  // раз при першому відкритті — щоб не дублювати контент у розмітці.
  var DATA = window.ANTIHAOS_PRODUCTS || {};

  function renderDetail(p) {
    var contents = p.contents.map(function (c) { return "<li>" + c + "</li>"; }).join("");
    var steps = p.usageSteps.map(function (s) { return "<li>" + s + "</li>"; }).join("");
    var legal = p.legalNote
      ? '<div class="pd-row"><span class="pd-label">Юридична примітка</span><p>' + p.legalNote + "</p></div>"
      : "";
    var packageName = p.packageLabel.split(" —")[0];
    return (
      '<div class="pd-body">' +
      '<div class="pd-row"><span class="pd-label">Кому підходить</span><p>' + p.audience + "</p></div>" +
      '<div class="pd-row"><span class="pd-label">Що всередині</span><ul class="pd-list">' + contents + "</ul></div>" +
      '<div class="pd-row"><span class="pd-label">Як використати</span><ol class="pd-list">' + steps + "</ol></div>" +
      '<div class="pd-row"><span class="pd-label">Результат</span><p>' + p.result + "</p></div>" +
      legal +
      '<div class="pd-package"><span class="pd-package-badge">' + p.packageLabel + "</span>" +
      '<a href="' + p.packageHref + '">Усе це входить у ' + packageName + " →</a></div>" +
      "</div>"
    );
  }

  var triggers = document.querySelectorAll(".product-trigger");
  triggers.forEach(function (trigger) {
    var id = trigger.getAttribute("data-product-id");
    var product = DATA[id];
    var card = trigger.closest(".preview-card");
    var panel = card ? card.querySelector(".product-detail-inner") : null;
    if (!product || !panel) return;
    var rendered = false;

    trigger.addEventListener("click", function () {
      if (!rendered) {
        panel.innerHTML = renderDetail(product);
        rendered = true;
      }
      var expanded = trigger.getAttribute("aria-expanded") === "true";
      trigger.setAttribute("aria-expanded", String(!expanded));
      card.classList.toggle("is-open", !expanded);
    });
  });

  // Картки-блокери ("Немає чіткого оферу" тощо) не мають власної деталі —
  // вони ведуть до продукту, який вирішує саме цю проблему, і відкривають
  // його панель у product-preview, замість того щоб просто виглядати
  // клікабельними й нічого не робити.
  var problemLinks = document.querySelectorAll("[data-link-product]");
  problemLinks.forEach(function (btn) {
    btn.addEventListener("click", function () {
      var id = btn.getAttribute("data-link-product");
      var target = document.querySelector('.product-trigger[data-product-id="' + id + '"]');
      if (!target) return;
      if (target.getAttribute("aria-expanded") !== "true") target.click();
      target.scrollIntoView({ behavior: "smooth", block: "center" });
      target.focus({ preventScroll: true });
    });
  });
})();
