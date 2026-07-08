(function () {
  var route = document.getElementById("chaosRoute");
  if (!route) return;

  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduceMotion || !("IntersectionObserver" in window)) {
    // Без анімації: маршрут одразу у фінальному, зібраному стані (лінія й вузли вже видимі за замовчуванням).
    return;
  }

  route.classList.add("js-animated");

  var observer = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          route.classList.add("is-visible");
          observer.unobserve(route);
        }
      });
    },
    { threshold: 0.35 }
  );

  observer.observe(route);
})();
