import { createHash } from 'node:crypto';
import type { Language } from '../shared/types';
import { DEVELOPER_URL, PROJECT_URL } from './release-version';

export const LICENSE_URL = `${PROJECT_URL}/blob/master/LICENSE`;
export const NOTICES_URL = `${PROJECT_URL}/blob/master/THIRD_PARTY_NOTICES.md`;

type Rect = { x: number; y: number; width: number; height: number };

/** Centre a dialog over its owner window, keeping it inside the owner's work area. */
export function centredOver(owner: Rect, dialog: Rect, area: Rect): Rect {
  const x = Math.round(owner.x + (owner.width - dialog.width) / 2);
  const y = Math.round(owner.y + (owner.height - dialog.height) / 2);
  return {
    x: Math.max(area.x, Math.min(x, area.x + area.width - dialog.width)),
    y: Math.max(area.y, Math.min(y, area.y + area.height - dialog.height)),
    width: dialog.width,
    height: dialog.height,
  };
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[character]!,
  );
}

const text = {
  en: {
    title: 'About OpenMathpix',
    version: 'Version',
    tagline: 'Snip any formula into LaTeX, right on your own computer.',
    developer: 'Developer',
    source: 'Source code',
    license: 'License',
    notices: 'Third-party notices',
    copyright: 'Copyright',
    ok: 'OK',
    opens: 'Opens in your browser',
  },
  'zh-CN': {
    title: '关于 OpenMathpix',
    version: '版本',
    tagline: '截取任意公式，在本机即可转换为 LaTeX。',
    developer: '开发者',
    source: '源代码',
    license: '许可证',
    notices: '第三方声明',
    copyright: '版权所有',
    ok: '确定',
    opens: '在浏览器中打开',
  },
};

// Enter and Escape close the dialog like a native one; Enter on a focused link opens it.
const SCRIPT = [
  "const ok = document.getElementById('ok');",
  'ok.addEventListener("click", () => window.close());',
  'document.addEventListener("keydown", (event) => {',
  '  const onLink = document.activeElement instanceof HTMLAnchorElement;',
  '  if (event.key === "Escape" || (event.key === "Enter" && !onLink)) {',
  '    event.preventDefault();',
  '    window.close();',
  '  }',
  '});',
].join('\n');

// A small "opens externally" arrow after each link.
const EXTERNAL =
  '<svg class="ext" viewBox="0 0 12 12" aria-hidden="true"><path d="M4.5 2.5h5v5M9.5 2.5 3 9" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function link(href: string, label: string, title: string): string {
  return `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer" title="${escapeHtml(title)}">${escapeHtml(label)}${EXTERNAL}</a>`;
}

/** A self-contained page: no preload, no remote content, one hashed inline script. */
export function createAboutHtml(language: Language, version: string, iconDataUrl: string): string {
  const t = text[language];
  const scriptHash = createHash('sha256').update(SCRIPT).digest('base64');
  // Date-based versions start with the release year.
  const year = /^\d{4}/.exec(version)?.[0] ?? String(new Date().getFullYear());
  const repository = PROJECT_URL.replace(/^https:\/\//, '');
  return `<!doctype html>
<html lang="${language}"><head><meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'sha256-${scriptHash}'; base-uri 'none'; form-action 'none'">
<meta name="color-scheme" content="light dark">
<title>${escapeHtml(t.title)}</title>
<style>
:root{--bg:#fff;--surface:#f8fafc;--border:#e5e7eb;--text:#111827;--muted:#6b7280;--link:#2563eb;--footer:#f3f4f6;--accent:#2563eb;--accent-hover:#1d4ed8}
@media (prefers-color-scheme:dark){:root{--bg:#111827;--surface:#1a2332;--border:#2d3748;--text:#f3f4f6;--muted:#9ca3af;--link:#60a5fa;--footer:#0d131f;--accent:#3b82f6;--accent-hover:#2563eb}}
*{box-sizing:border-box;margin:0}
html,body{background:var(--bg)}
body{color:var(--text);font:14px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Microsoft YaHei UI',sans-serif;-webkit-user-select:none;user-select:none;cursor:default}
main{display:flex;flex-direction:column;align-items:center;padding:30px 32px 0;text-align:center}
.icon{width:76px;height:76px;filter:drop-shadow(0 4px 10px rgba(37,62,170,.28))}
h1{margin-top:14px;font-size:22px;font-weight:600;letter-spacing:-.2px}
.version{margin-top:2px;color:var(--muted);font-size:13px;-webkit-user-select:text;user-select:text;cursor:text}
.tagline{margin-top:10px;color:var(--muted);font-size:13px;max-width:390px;text-wrap:balance}
dl{width:100%;margin-top:22px;padding:2px 16px;display:grid;grid-template-columns:auto 1fr;text-align:left;background:var(--surface);border:1px solid var(--border);border-radius:8px}
dl>div{grid-column:1/-1;display:grid;grid-template-columns:subgrid;column-gap:20px;padding:9px 0;font-size:13px}
dl>div+div{border-top:1px solid var(--border)}
dt{color:var(--muted);white-space:nowrap}
dd{min-width:0;overflow-wrap:anywhere}
.sep{color:var(--muted);margin:0 6px}
a{color:var(--link);text-decoration:none;border-radius:3px;cursor:pointer;white-space:nowrap}
a:hover{text-decoration:underline}
.ext{width:10px;height:10px;margin-left:3px;vertical-align:-1px;opacity:.75}
footer{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-top:24px;padding:14px 20px;background:var(--footer);border-top:1px solid var(--border)}
small{color:var(--muted);font-size:12px}
button{min-width:88px;padding:6px 20px;font:inherit;font-size:13px;color:#fff;background:var(--accent);border:0;border-radius:6px;cursor:pointer}
button:hover{background:var(--accent-hover)}
a:focus-visible,button:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
</style></head><body>
<main>
<img class="icon" src="${escapeHtml(iconDataUrl)}" alt="">
<h1>OpenMathpix</h1>
<div class="version">${escapeHtml(t.version)} ${escapeHtml(version)}</div>
<p class="tagline">${escapeHtml(t.tagline)}</p>
<dl>
<div><dt>${escapeHtml(t.developer)}</dt><dd>${link(DEVELOPER_URL, 'Wei Zhuo', t.opens)}</dd></div>
<div><dt>${escapeHtml(t.source)}</dt><dd>${link(PROJECT_URL, repository, t.opens)}</dd></div>
<div><dt>${escapeHtml(t.license)}</dt><dd>${link(LICENSE_URL, 'GNU AGPL v3.0', t.opens)}<span class="sep">·</span>${link(NOTICES_URL, t.notices, t.opens)}</dd></div>
</dl>
</main>
<footer><small>${escapeHtml(t.copyright)} © ${year} Wei Zhuo</small><button id="ok" type="button">${escapeHtml(t.ok)}</button></footer>
<script>${SCRIPT}</script></body></html>`;
}
