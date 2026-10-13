import { App } from './app.js';
import { loadImages } from './view/assets.js';

async function start(snapshot = {}) {
  const root = document.getElementById('app');
  const fill = root.querySelector('#loading-fill');
  const text = root.querySelector('#loading-text');
  try {
    const fonts = document.fonts
      ? Promise.all([document.fonts.load("40px 'Lilita One'"), document.fonts.load("16px 'Fredoka'")]).catch(() => null)
      : null;
    const images = await loadImages((k) => (fill.style.width = `${Math.round(k * 100)}%`));
    // Canvas text needs the display font; give it a moment, but never block the game on it.
    await Promise.race([fonts, new Promise((resolve) => setTimeout(resolve, 2500))]);
    const app = new App(root, { images, snapshot: snapshot ?? {} });
    window.claude?.hot?.snapshot?.(() => app.snapshot());
    if (/[?&]debug\b/.test(location.search)) window.__app = app;
    app.showTitle();
  } catch (error) {
    console.error(error);
    text.textContent = 'The sweets did not load. Check your connection, then reload the page.';
  }
}

const hot = window.claude?.hot;
if (hot?.ready) hot.ready(start);
else start(hot?.data ?? {});
