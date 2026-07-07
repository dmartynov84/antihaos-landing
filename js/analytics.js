(function () {
  var cfg = window.ANALYTICS_CONFIG || {};
  var ga4Id = cfg.GA4_ID;
  var pixelId = cfg.PIXEL_ID;
  var ga4Ready = !!ga4Id && ga4Id !== "TODO";
  var pixelReady = !!pixelId && pixelId !== "TODO";

  if (!ga4Ready && !pixelReady) {
    console.warn("[analytics] GA4_ID/PIXEL_ID не задані у js/analytics-config.js — аналітика вимкнена");
    return;
  }

  if (ga4Ready) {
    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
    var gaScript = document.createElement("script");
    gaScript.async = true;
    gaScript.src = "https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(ga4Id);
    document.head.appendChild(gaScript);
    window.gtag("js", new Date());
    window.gtag("config", ga4Id);
  } else {
    console.warn("[analytics] GA4_ID не задано — GA4 вимкнено");
  }

  if (pixelReady) {
    /* eslint-disable */
    !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
    n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
    n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
    t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
    document,'script','https://connect.facebook.net/en_US/fbevents.js');
    /* eslint-enable */
    window.fbq("init", pixelId);
    window.fbq("track", "PageView");
  } else {
    console.warn("[analytics] PIXEL_ID не задано — Meta Pixel вимкнено");
  }

  function trackEvent(name, params) {
    if (ga4Ready && window.gtag) window.gtag("event", name, params || {});
    if (pixelReady && window.fbq) window.fbq("trackCustom", name, params || {});
  }
  window.antihaosTrack = trackEvent;

  function onReady() {
    var page = document.body.getAttribute("data-page");
    if (page === "pro") trackEvent("view_pro");
    document.querySelectorAll('[data-track="click_buy"]').forEach(function (el) {
      el.addEventListener("click", function () {
        trackEvent("click_buy", { page: page || "unknown" });
      });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", onReady);
  } else {
    onReady();
  }
})();
