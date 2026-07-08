(function () {
  var sections = document.querySelectorAll("main > section:not(.hero)");
  if (!sections.length) return;
  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduceMotion || !("IntersectionObserver" in window)) return;

  sections.forEach(function (s) {
    s.classList.add("js-reveal");
  });

  var observer = new IntersectionObserver(function (entries) {
    var visible = entries.filter(function (entry) {
      return entry.isIntersecting;
    });
    visible.forEach(function (entry, i) {
      var el = entry.target;
      el.style.transitionDelay = i * 70 + "ms";
      el.classList.add("is-revealed");
      observer.unobserve(el);
    });
  }, { threshold: 0.15 });

  sections.forEach(function (s) {
    observer.observe(s);
  });
})();
