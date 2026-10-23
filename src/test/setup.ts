import { afterEach, beforeEach } from "vitest";
import { cleanup } from "@testing-library/react";
import "fake-indexeddb/auto";
import "@testing-library/jest-dom/vitest";

// IndexedDB is not available in jsdom; `fake-indexeddb/auto` provides it.

// Three browser primitives jsdom implements incompletely, each of which the
// screenshot pipeline reaches for. Real browsers have all of them, so they are
// filled in here rather than worked around in `src/`. Test-only.
//
// 1. `Blob.prototype.arrayBuffer` — jsdom's Blob predates the method, yet it is
//    the only way to read an image header. FileReader is implemented, so use it.
// 2. `fake-indexeddb` clones stored values with Node's `structuredClone`, which
//    does not recognise jsdom's Blob: an inserted image came back as a bare
//    Object with no bytes, silently. A Blob is immutable, so handing the clone
//    the same instance is safe; anything that is not a Blob keeps cloning natively.
// 3. `URL.createObjectURL` — absent, and previewing an image needs one.
if (typeof Blob.prototype.arrayBuffer !== "function") {
  Blob.prototype.arrayBuffer = function arrayBuffer(this: Blob): Promise<ArrayBuffer> {
    return new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(this);
    });
  };
}

const nativeStructuredClone = globalThis.structuredClone.bind(globalThis);

function clonePreservingBlobs<T>(value: T): T {
  if (value instanceof Blob) return value;
  if (Array.isArray(value)) return value.map((item) => clonePreservingBlobs(item)) as unknown as T;
  if (isPlainRecord(value)) {
    const clone = Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [key, clonePreservingBlobs(nested)]),
    );
    return clone as unknown as T;
  }
  return nativeStructuredClone(value);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

globalThis.structuredClone = clonePreservingBlobs;

let objectUrlSeq = 0;
if (typeof URL.createObjectURL !== "function") {
  URL.createObjectURL = () => `blob:tft-test/${++objectUrlSeq}`;
  URL.revokeObjectURL = () => undefined;
}

// jsdom also never matches media queries, which would pin every responsive
// component to its mobile branch. Evaluate width like a browser instead.
const listeners = new Set<() => void>();

function mediaMatches(query: string): boolean {
  const width = window.innerWidth;
  const min = /min-width:\s*(\d+)px/.exec(query);
  const max = /max-width:\s*(\d+)px/.exec(query);
  if (min && width < Number(min[1])) return false;
  if (max && width > Number(max[1])) return false;
  return true;
}

beforeEach(() => {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      media: query,
      get matches() {
        return mediaMatches(query);
      },
      onchange: null,
      addListener: (cb: () => void) => listeners.add(cb),
      removeListener: (cb: () => void) => listeners.delete(cb),
      addEventListener: (_: string, cb: () => void) => listeners.add(cb),
      removeEventListener: (_: string, cb: () => void) => listeners.delete(cb),
      dispatchEvent: () => false,
    }),
  });
  Object.defineProperty(window, "innerWidth", { configurable: true, writable: true, value: 1280 });
});

// Vitest globals are off, so React Testing Library cannot register its own
// auto-cleanup — do it here or components accumulate across tests.
afterEach(cleanup);

export { mediaMatches };
