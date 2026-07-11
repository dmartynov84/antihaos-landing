(function () {
  // SITE-1.14: замінює step-accordion.js (SITE-1.13). Inline-акордеон
  // розпихав сітку .steps по вертикалі — картки в ряду переставали бути
  // на одному рівні. native <dialog> рендериться в top layer, тому сітка
  // структурно не може зсунутись. showModal() дає нативний focus-trap;
  // Esc перехоплено (cancel-подія), щоб програти fade-вихід перед close().
  var dialog = document.getElementById("step-modal");
  if (!dialog) return;

  var closeBtn = dialog.querySelector(".step-modal-close");
  var numEl = dialog.querySelector(".step-modal-num");
  var titleEl = dialog.querySelector(".step-modal-title");
  var summaryEl = dialog.querySelector(".step-modal-summary");
  var outcomeEl = dialog.querySelector(".step-modal-outcome");
  var detailEl = dialog.querySelector(".step-modal-detail");
  var lastTrigger = null;

  function openModal(trigger) {
    var step = trigger.closest(".step");
    var detailSource = step.querySelector(".step-detail-inner");
    numEl.textContent = step.querySelector(".num").textContent.trim();
    titleEl.textContent = step.querySelector("h3").textContent.trim();
    summaryEl.textContent = step.querySelector("p:not(.step-outcome)").textContent.trim();
    outcomeEl.textContent = step.querySelector(".step-outcome").textContent.trim();
    detailEl.textContent = detailSource ? detailSource.textContent.trim() : "";

    lastTrigger = trigger;
    document.body.classList.add("modal-open");
    dialog.showModal();
    // подвійний rAF: дає браузеру відрендерити початковий стан (opacity:0,
    // scale(.95)) хоча б один кадр перед стартом transition до is-visible
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        dialog.classList.add("is-visible");
      });
    });
  }

  function closeModal() {
    dialog.classList.remove("is-visible");
    document.body.classList.remove("modal-open");
    var finished = false;
    function finish() {
      if (finished) return;
      finished = true;
      dialog.close();
      if (lastTrigger) lastTrigger.focus();
    }
    dialog.addEventListener("transitionend", finish, { once: true });
    setTimeout(finish, 260); // фолбек: prefers-reduced-motion прибирає transition
  }

  document.querySelectorAll(".step-trigger").forEach(function (trigger) {
    trigger.addEventListener("click", function () {
      openModal(trigger);
    });
  });

  closeBtn.addEventListener("click", closeModal);

  // Клік по backdrop: подія спливає до самого <dialog>, а target === dialog
  // лише коли клікнули поза видимим контентом (стандартний патерн).
  dialog.addEventListener("click", function (e) {
    if (e.target === dialog) closeModal();
  });

  // Esc за замовчуванням закриває <dialog> миттєво (cancel -> close без
  // transition) — перехоплюємо, щоб завжди йти через анімований closeModal().
  dialog.addEventListener("cancel", function (e) {
    e.preventDefault();
    closeModal();
  });
})();
