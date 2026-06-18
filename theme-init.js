/**
 * Runs synchronously in <head> before the body paints, so the saved theme is
 * applied with no flash of the default (dark) theme. chrome.storage is async and
 * would paint first, so the preference is mirrored to localStorage for this
 * one synchronous read; chrome.storage remains the source of truth.
 */
try {
  const t = localStorage.getItem('rtTheme');
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
} catch (e) { /* localStorage unavailable — fall back to the default theme */ }
