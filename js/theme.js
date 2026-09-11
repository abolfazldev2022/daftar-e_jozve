// theme.js — light/dark mode, persisted in the settings object store

import DB from './db.js';

const SETTING_KEY = 'theme';

export async function initTheme() {
  const saved = await DB.getSetting(SETTING_KEY, null);
  const theme = saved || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  applyTheme(theme);
  return theme;
}

export function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
}

export async function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'light';
  const next = current === 'light' ? 'dark' : 'light';
  applyTheme(next);
  await DB.setSetting(SETTING_KEY, next);
  return next;
}
