process.env.TZ = 'Asia/Kuala_Lumpur';
import '@testing-library/jest-dom/vitest';
import 'fake-indexeddb/auto';

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;
