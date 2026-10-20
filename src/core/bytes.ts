/**
 * Copies a typed array into a plain ArrayBuffer.
 *
 * TypeScript 7 models ArrayBufferLike vs ArrayBuffer strictly; browser APIs such
 * as Blob, WebCrypto, and postMessage transfers require a plain ArrayBuffer.
 */
export function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer as ArrayBuffer;
}

export function toBlob(bytes: Uint8Array, type: string): Blob {
  return new Blob([toArrayBuffer(bytes)], { type });
}
