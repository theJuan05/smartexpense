// ── DARK MODE ────────────────────────────────────────────────
// Saves preference to localStorage so it persists across sessions

const DARK_KEY = 'smartexpense-dark-mode';

// Apply dark mode on page load before anything renders
(function () {
  if (localStorage.getItem(DARK_KEY) === 'true') {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
})();

function isDarkMode() {
  return document.documentElement.getAttribute('data-theme') === 'dark';
}

function enableDarkMode() {
  document.documentElement.setAttribute('data-theme', 'dark');
  localStorage.setItem(DARK_KEY, 'true');
  updateToggleButton();
}

function disableDarkMode() {
  document.documentElement.removeAttribute('data-theme');
  localStorage.setItem(DARK_KEY, 'false');
  updateToggleButton();
}

function toggleDarkMode() {
  if (isDarkMode()) {
    disableDarkMode();
  } else {
    enableDarkMode();
  }
}

function updateToggleButton() {
  const btn = document.getElementById('btn-dark-mode');
  if (!btn) return;
  if (isDarkMode()) {
    btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>';
    btn.setAttribute('aria-label', 'Switch to light mode');
    btn.title = 'Switch to Light Mode';
  } else {
    btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
    btn.setAttribute('aria-label', 'Switch to dark mode');
    btn.title = 'Switch to Dark Mode';
  }
}

function updateThemePicker() {
  const dark  = isDarkMode();
  const light = document.getElementById('theme-opt-light');
  const dkBtn = document.getElementById('theme-opt-dark');
  const label = document.getElementById('theme-current-label');

  if (light) {
    light.classList.toggle('active', !dark);
    light.setAttribute('aria-checked', String(!dark));
  }
  if (dkBtn) {
    dkBtn.classList.toggle('active', dark);
    dkBtn.setAttribute('aria-checked', String(dark));
  }
  if (label) label.textContent = dark ? 'Dark' : 'Light';
}

document.addEventListener('DOMContentLoaded', () => {
  updateToggleButton();
  updateThemePicker();

  // Navbar icon button
  const btn = document.getElementById('btn-dark-mode');
  if (btn) btn.addEventListener('click', () => { toggleDarkMode(); updateThemePicker(); });

  // Theme picker cards
  document.querySelectorAll('.theme-option').forEach(function (opt) {
    opt.addEventListener('click', function () {
      const theme = this.dataset.theme;
      if (theme === 'dark') enableDarkMode(); else disableDarkMode();
      updateThemePicker();
    });
  });

  // Keep old checkbox in sync if it still exists elsewhere
  const oldToggle = document.getElementById('settings-dark-toggle');
  if (oldToggle) {
    oldToggle.checked = isDarkMode();
    oldToggle.addEventListener('change', function () {
      if (this.checked) enableDarkMode(); else disableDarkMode();
      updateThemePicker();
    });
  }
});