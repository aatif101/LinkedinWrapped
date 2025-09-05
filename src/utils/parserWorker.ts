import type { ParsedPayload } from '../types/parser';

// Worker instance
let worker: Worker | null = null;

// Initialize worker
function initWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('../workers/parser.worker.ts', import.meta.url), {
      type: 'module'
    });
  }
  return worker;
}

// Parse files using the worker
export function parseFiles(files: File[]): Promise<ParsedPayload> {
  return new Promise((resolve, reject) => {
    const workerInstance = initWorker();
    
    const timeoutId = setTimeout(() => {
      reject(new Error('Parser timeout - processing took too long'));
    }, 60000); // 60 second timeout
    
    workerInstance.onmessage = (event) => {
      clearTimeout(timeoutId);
      const payload: ParsedPayload = event.data;
      resolve(payload);
    };
    
    workerInstance.onerror = (error) => {
      clearTimeout(timeoutId);
      reject(new Error(`Worker error: ${error.message}`));
    };
    
    // Send files to worker
    workerInstance.postMessage(files);
  });
}

// Cleanup worker
export function terminateWorker() {
  if (worker) {
    worker.terminate();
    worker = null;
  }
}
