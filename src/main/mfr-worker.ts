import { performance } from 'node:perf_hooks';
import { createMfrEngine, type MfrEngine } from '../services/mfr-engine';
import { createTextellerEngine } from '../services/texteller-engine';

interface Request {
  id: number;
  modelDir: string;
  /** Omitted for a warm-up request, which only loads the model and sends no reply. */
  imageBase64?: string;
}
let engine: Promise<MfrEngine> | undefined;
let busy = false;

function loadEngine(modelDir: string): Promise<MfrEngine> {
  engine ??= (
    process.argv.includes('texteller') ? createTextellerEngine(modelDir) : createMfrEngine(modelDir)
  ).catch((error: unknown) => {
    // A failed load must be retried, and reported, by the next recognition request.
    engine = undefined;
    throw error;
  });
  return engine;
}
const send = (message: unknown) => {
  if (process.parentPort) process.parentPort.postMessage(message);
  else if (process.send) process.send(message);
};

async function handle(request: Request): Promise<void> {
  if (request.imageBase64 === undefined) {
    // Overlap model loading with the user's selection; errors surface on recognition.
    void loadEngine(request.modelDir).catch(() => undefined);
    return;
  }
  if (busy) {
    send({ id: request.id, error: 'Local recognition is already running.' });
    return;
  }
  busy = true;
  try {
    const start = performance.now();
    const loaded = await loadEngine(request.modelDir);
    const loadMs = performance.now() - start;
    const result = await loaded.recognize(Buffer.from(request.imageBase64, 'base64'));
    send({
      id: request.id,
      result: { ...result, loadMs, peakRssKiB: process.resourceUsage().maxRSS },
    });
  } catch (error) {
    send({
      id: request.id,
      error: error instanceof Error ? error.message : 'Local recognition failed.',
    });
  } finally {
    busy = false;
  }
}

// Electron uses parentPort; the Node IPC path runs the same built worker in reproducible benchmarks.
if (process.parentPort)
  process.parentPort.on('message', (event) => {
    void handle(event.data);
  });
else {
  process.on('message', (message) => {
    void handle(message as Request);
  });
  process.on('disconnect', () => process.exit(0));
}
