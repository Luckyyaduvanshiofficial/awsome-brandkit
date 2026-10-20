import { toArrayBuffer } from "./bytes";

export async function sha256Hex(bytes: Uint8Array | ArrayBuffer): Promise<string> {
  const data = bytes instanceof Uint8Array ? toArrayBuffer(bytes) : bytes;
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function sha256Short(bytes: Uint8Array | ArrayBuffer, length = 12): Promise<string> {
  return (await sha256Hex(bytes)).slice(0, length);
}
