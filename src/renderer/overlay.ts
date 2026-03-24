import type { ScreenCapture, SnipSelection } from '../shared/types';

const canvas = document.getElementById('canvas') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const dimLabel = document.getElementById('dimensions')!;

let screenImg: HTMLImageElement | null = null;
let isDrawing = false;
let startX = 0;
let startY = 0;
let currentX = 0;
let currentY = 0;

// Receive screen data from main process
window.api.onOverlayScreenData(async (screenData: ScreenCapture[]) => {
  // We receive the primary display screenshot
  const s = screenData[0];
  if (!s) return;

  // Set canvas to match the window size (CSS pixels = logical/DIP)
  const w = window.innerWidth;
  const h = window.innerHeight;
  canvas.width = w;
  canvas.height = h;
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;

  // Load the screenshot image
  screenImg = await new Promise<HTMLImageElement>((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.src = s.dataUrl;
  });

  draw();

  // Signal to main process that overlay is ready to show
  window.api.sendOverlayReady();
});

function draw() {
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  // Draw captured screenshot filling the entire canvas
  if (screenImg) {
    ctx.drawImage(screenImg, 0, 0, w, h);
  }

  // Dark overlay
  ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
  ctx.fillRect(0, 0, w, h);

  // If selecting, clear the selected region to show the original image
  if (isDrawing) {
    const x = Math.min(startX, currentX);
    const y = Math.min(startY, currentY);
    const sw = Math.abs(currentX - startX);
    const sh = Math.abs(currentY - startY);

    if (sw > 0 && sh > 0) {
      // Clip and redraw the screenshot without dark overlay in the selection
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, sw, sh);
      ctx.clip();
      if (screenImg) {
        ctx.drawImage(screenImg, 0, 0, w, h);
      }
      ctx.restore();

      // Border around selection
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, sw, sh);
    }
  }
}

canvas.addEventListener('mousedown', (e) => {
  isDrawing = true;
  startX = e.clientX;
  startY = e.clientY;
  currentX = e.clientX;
  currentY = e.clientY;
});

canvas.addEventListener('mousemove', (e) => {
  if (!isDrawing) return;
  currentX = e.clientX;
  currentY = e.clientY;

  const sw = Math.abs(currentX - startX);
  const sh = Math.abs(currentY - startY);

  // Show dimensions
  dimLabel.style.display = 'block';
  dimLabel.textContent = `${sw} x ${sh}`;
  dimLabel.style.left = `${e.clientX + 12}px`;
  dimLabel.style.top = `${e.clientY + 12}px`;

  draw();
});

canvas.addEventListener('mouseup', () => {
  if (!isDrawing) return;
  isDrawing = false;
  dimLabel.style.display = 'none';

  const x = Math.min(startX, currentX);
  const y = Math.min(startY, currentY);
  const sw = Math.abs(currentX - startX);
  const sh = Math.abs(currentY - startY);

  if (sw < 10 || sh < 10) {
    // Selection too small - redraw and ignore
    draw();
    return;
  }

  // Send normalized coordinates (0-1 fractions) to avoid DPI mismatch
  const cw = canvas.width;
  const ch = canvas.height;
  const selection: SnipSelection = {
    x: x / cw,
    y: y / ch,
    width: sw / cw,
    height: sh / ch,
  };
  window.api.sendOverlaySelection(selection);
});

// Cancel on Escape
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    window.api.cancelOverlay();
  }
});
