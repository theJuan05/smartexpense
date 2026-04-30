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
    btn.textContent = '☀️';
    btn.title = 'Switch to Light Mode';
  } else {
    btn.textContent = '🌙';
    btn.title = 'Switch to Dark Mode';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  updateToggleButton();
  const btn = document.getElementById('btn-dark-mode');
  if (btn) btn.addEventListener('click', toggleDarkMode);
});