import icon from '../../build/icon-small.svg';

const card = document.getElementById('card')!;
const title = document.getElementById('title')!;
const body = document.getElementById('body')!;
const hint = document.getElementById('hint')!;
const close = document.getElementById('close') as HTMLButtonElement;
(document.getElementById('logo') as HTMLImageElement).src = icon;

// The popup closes itself after a while; hovering it keeps it open.
let timer: ReturnType<typeof setTimeout> | undefined;
let remaining = 0;
let started = 0;

function resume(): void {
  clearTimeout(timer);
  started = Date.now();
  timer = setTimeout(() => window.api.popupAction('close'), remaining);
}

function pause(): void {
  clearTimeout(timer);
  remaining = Math.max(1000, remaining - (Date.now() - started));
}

window.api.onPopup((content) => {
  document.documentElement.lang = content.language;
  card.dataset.kind = content.kind;
  title.textContent = content.title;
  body.textContent = content.body;
  body.title = content.body;
  hint.textContent = content.hint;
  close.setAttribute('aria-label', content.closeLabel);
  close.title = content.closeLabel;
  card.classList.add('visible');
  remaining = content.durationMs;
  if (card.matches(':hover')) pause();
  else resume();
});

card.addEventListener('mouseenter', pause);
card.addEventListener('mouseleave', resume);
card.addEventListener('click', () => window.api.popupAction('open'));
close.addEventListener('click', (event) => {
  event.stopPropagation();
  window.api.popupAction('close');
});
