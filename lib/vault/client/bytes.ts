// Browser-safe byte helpers (no Buffer).
export const FRAME_VERSION = 0x01;

export function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export function fromBase64(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes as BufferSource));
  return Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

export function frame(header: number[] | Uint8Array, payload: Uint8Array): Uint8Array {
  return concatBytes(new Uint8Array([FRAME_VERSION, ...header]), payload);
}

export function unframe(framed: Uint8Array, headerLength: number): { header: Uint8Array; payload: Uint8Array } {
  if (framed.length < 1 + headerLength || framed[0] !== FRAME_VERSION) throw new Error("ciphertext_frame_invalid");
  return { header: framed.subarray(1, 1 + headerLength), payload: framed.subarray(1 + headerLength) };
}
