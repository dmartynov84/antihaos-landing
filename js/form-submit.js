(function () {
  // Netlify Forms при звичайному POST не завжди веде на action-таргет —
  // перевірено діагностикою LEAD-2: чистий curl POST на /thanks і навіть
  // на /thank-you.html повертає СТОКОВУ сторінку Netlify "Thank you!",
  // хоча лід коректно долітає у Netlify Forms (підтверджено через API).
  // Тобто ліди не губляться, але користувач не бачить чекліст одразу.
  // Офіційний спосіб Netlify обійти це — самим слати fetch і робити редирект.
  function serialize(form) {
    return new URLSearchParams(new FormData(form)).toString();
  }

  function handleSubmit(e) {
    var form = e.target;
    // Netlify своїм build-time постпроцесингом ВИДАЛЯЄ атрибут data-netlify
    // з готового HTML (перевірено: є в закомічених джерелах, немає в живому
    // DOM), тож перевіряти форму по ньому не можна — орієнтуємось на
    // прихований form-name, який постпроцесинг не чіпає.
    if (!(form instanceof HTMLFormElement) || !form.querySelector('input[name="form-name"]')) return;
    e.preventDefault();

    var submitBtn = form.querySelector('button[type="submit"]');
    if (submitBtn) submitBtn.disabled = true;
    var target = form.getAttribute('action') || '/thanks';

    fetch('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: serialize(form),
    })
      .then(function () {
        window.location.href = target;
      })
      .catch(function () {
        // Мережева помилка — все одно ведемо на thanks, як і робив би
        // звичайний non-JS сабміт форми (Netlify вже міг прийняти POST).
        if (submitBtn) submitBtn.disabled = false;
        window.location.href = target;
      });
  }

  document.addEventListener('submit', handleSubmit, true);
})();
