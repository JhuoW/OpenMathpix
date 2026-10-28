import type { ScreenCapture, SnipSelection } from '../shared/types';

const canvas = document.getElementById('canvas') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const dimLabel = document.getElementById('dimensions')!;
const instruction = document.getElementById('instruction')!;

let screenImg: HTMLImageElement | null = null;
let isDrawing = false;
let submitted = false;
let startX = 0;
let startY = 0;
let currentX = 0;
let currentY = 0;
let viewportWidth = 0;
let viewportHeight = 0;

window.api.onOverlayScreenData(async (screenData: ScreenCapture[]) => {
  const capture = screenData[0];
  if (!capture) return;
  try {
    screenImg = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Unable to load the captured display.'));
      image.src = capture.dataUrl;
    });
    resizeCanvas();
    window.api.sendOverlayReady();
  } catch (error) {
    console.error(error);
    window.api.cancelOverlay();
  }
});

function resizeCanvas(): void {
  viewportWidth = window.innerWidth;
  viewportHeight = window.innerHeight;
  // Keep drawing coordinates in DIP while preserving sharpness on HiDPI displays.
  const scale = window.devicePixelRatio || 1;
  canvas.width = Math.round(viewportWidth * scale);
  canvas.height = Math.round(viewportHeight * scale);
  canvas.style.width = `${viewportWidth}px`;
  canvas.style.height = `${viewportHeight}px`;
  ctx.setTransform(canvas.width / viewportWidth, 0, 0, canvas.height / viewportHeight, 0, 0);
  draw();
}

window.addEventListener('resize', () => {
  isDrawing = false;
  dimLabel.style.display = 'none';
  resizeCanvas();
});

function draw(): void {
  const w = viewportWidth;
  const h = viewportHeight;
  ctx.clearRect(0, 0, w, h);
  if (screenImg) ctx.drawImage(screenImg, 0, 0, w, h);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
  ctx.fillRect(0, 0, w, h);

  if (isDrawing) {
    const x = Math.min(startX, currentX);
    const y = Math.min(startY, currentY);
    const width = Math.abs(currentX - startX);
    const height = Math.abs(currentY - startY);
    if (width > 0 && height > 0) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, width, height);
      ctx.clip();
      if (screenImg) ctx.drawImage(screenImg, 0, 0, w, h);
      ctx.restore();
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, width, height);
    }
  }
}

function updatePointer(event: PointerEvent): void {
  currentX = Math.max(0, Math.min(viewportWidth, event.clientX));
  currentY = Math.max(0, Math.min(viewportHeight, event.clientY));
}

canvas.addEventListener('pointerdown', (event) => {
  if (event.button !== 0 || !event.isPrimary || !screenImg || submitted) return;
  canvas.setPointerCapture(event.pointerId);
  updatePointer(event);
  startX = currentX;
  startY = currentY;
  isDrawing = true;
  instruction.style.display = 'none';
  draw();
});

canvas.addEventListener('pointermove', (event) => {
  if (!isDrawing || !event.isPrimary) return;
  updatePointer(event);
  const width = Math.abs(currentX - startX);
  const height = Math.abs(currentY - startY);
  // Report the pixels that will actually be cropped, not CSS pixels.
  const pixelWidth = Math.round((width / viewportWidth) * screenImg!.naturalWidth);
  const pixelHeight = Math.round((height / viewportHeight) * screenImg!.naturalHeight);
  dimLabel.style.display = 'block';
  dimLabel.textContent = `${pixelWidth} × ${pixelHeight} px`;
  dimLabel.style.left = `${Math.max(0, Math.min(currentX + 12, viewportWidth - dimLabel.offsetWidth - 8))}px`;
  dimLabel.style.top = `${Math.max(0, Math.min(currentY + 12, viewportHeight - dimLabel.offsetHeight - 8))}px`;
  draw();
});

canvas.addEventListener('pointerup', (event) => {
  if (!isDrawing || !event.isPrimary) return;
  updatePointer(event);
  isDrawing = false;
  dimLabel.style.display = 'none';
  if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);

  const x = Math.min(startX, currentX);
  const y = Math.min(startY, currentY);
  const width = Math.abs(currentX - startX);
  const height = Math.abs(currentY - startY);
  if (width < 10 || height < 10) {
    instruction.textContent = 'Selection too small. Select a larger area, or press Esc to cancel.';
    instruction.style.display = 'block';
    draw();
    return;
  }

  const selection: SnipSelection = {
    x: x / viewportWidth,
    y: y / viewportHeight,
    width: width / viewportWidth,
    height: height / viewportHeight,
  };
  submitted = true;
  window.api.sendOverlaySelection(selection);
});

function resetSelection(): void {
  isDrawing = false;
  dimLabel.style.display = 'none';
  draw();
}

canvas.addEventListener('pointercancel', resetSelection);
canvas.addEventListener('lostpointercapture', resetSelection);
canvas.addEventListener('contextmenu', (event) => event.preventDefault());
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') window.api.cancelOverlay();
});
