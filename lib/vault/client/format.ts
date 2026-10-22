// Display helpers. Decrypted names are untrusted user input: render as text, sanitize for `download`.

const CONTROL_OR_SEPARATOR = /[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩/\\:*?"<>|]/g;
const RESERVED = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i;

export function sanitizeDownloadName(name: string, fallback = "document"): string {
  let s = name.normalize("NFC").replace(CONTROL_OR_SEPARATOR, "_").replace(/\s+/g, " ").trim();
  s = s.replace(/^[.\s]+/, "").replace(/[.\s]+$/, ""); // no leading dots (hidden/relative), no trailing dots or spaces
  if (RESERVED.test(s)) s = `_${s}`;
  if (s.length > 200) {
    const dot = s.lastIndexOf(".");
    const ext = dot > 0 && s.length - dot <= 10 ? s.slice(dot) : "";
    s = s.slice(0, 200 - ext.length) + ext;
  }
  return s || fallback;
}

export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "-";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KiB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MiB`;
}
