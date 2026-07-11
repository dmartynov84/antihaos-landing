(function () {
  // SITE-1.13: клік по картці кроку розкриває деталі — раніше картки мали
  // hover, але клік нічого не робив ("незавершений проект", фідбек власника).
  // Кожна картка розгортається незалежно (можна тримати відкритими кілька).
  var triggers = document.querySelectorAll('.step-trigger');

  triggers.forEach(function (trigger) {
    trigger.addEventListener('click', function () {
      var step = trigger.closest('.step');
      var expanded = trigger.getAttribute('aria-expanded') === 'true';
      trigger.setAttribute('aria-expanded', String(!expanded));
      step.classList.toggle('is-open', !expanded);
    });
  });
})();
