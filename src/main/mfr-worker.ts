import { performance } from 'node:perf_hooks';
import { createMfrEngine, type MfrEngine } from '../services/mfr-engine';

interface Request {
  id: number;
  modelDir: string;
  imageBase64: string;
}
let engine: MfrEngine | undefined;
let busy = false;
const send = (message: unknown) => {
  if (process.parentPort) process.parentPort.postMessage(message);
  else if (process.send) process.send(message);
};

async function handle(request: Request): Promise<void> {
  if (busy) {
    send({ id: request.id, error: 'Local recognition is already running.' });
    return;
  }
  busy = true;
  try {
    const start = performance.now();
    if (!engine) engine = await createMfrEngine(request.modelDir);
    const loadMs = performance.now() - start;
    const result = await engine.recognize(Buffer.from(request.imageBase64, 'base64'));
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
