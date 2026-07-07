(function () {
  var UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content'];
  var STORAGE_KEY = 'antihaos_utm';

  function getParam(name) {
    var m = new RegExp('[?&]' + name + '=([^&]*)').exec(window.location.search);
    return m ? decodeURIComponent(m[1].replace(/\+/g, ' ')) : null;
  }

  var stored = {};
  try {
    stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  } catch (e) {}

  var changed = false;
  UTM_KEYS.forEach(function (key) {
    var value = getParam(key);
    if (value) {
      stored[key] = value;
      changed = true;
    }
  });
  // Перший реферер (звідки прийшли) не перезаписуємо переходами index->pro всередині сайту.
  if (!stored.referrer && document.referrer) {
    stored.referrer = document.referrer;
    changed = true;
  }
  if (changed) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
    } catch (e) {}
  }

  function fillForms() {
    document.querySelectorAll('form[data-netlify]').forEach(function (form) {
      UTM_KEYS.concat(['referrer']).forEach(function (key) {
        var el = form.querySelector('input[name="' + key + '"]');
        if (el && stored[key]) el.value = stored[key];
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', fillForms);
  } else {
    fillForms();
  }
})();
