/**
 * CTAクリック追跡 - GA4 cta_click イベント送信
 */
document.addEventListener('DOMContentLoaded', function () {
  const ctas = document.querySelectorAll('[data-cta]');

  ctas.forEach(function (el) {
    el.addEventListener('click', function () {
      if (typeof window.gtag === 'function') {
        window.gtag('event', 'cta_click', {
          cta_name: el.dataset.cta || 'unknown',
          cta_location: el.dataset.ctaLocation || 'unknown',
          cta_text: (el.textContent || '').trim(),
          page_path: window.location.pathname,
          debug_mode: true
        });
      }
    });
  });
});
