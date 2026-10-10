export function bytes(n: number | null | undefined): string {
  let v = Number(n || 0);
  const u = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(i >= 2 ? (v >= 100 ? 0 : 1) : 0)} ${u[i]}`;
}

export const speed = (n: number) => `${bytes(n)}/s`;

export function elapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

export function ago(t?: number): string {
  if (!t) return "never";
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}

export const pingTone = (p: number | null | undefined) =>
  p == null ? "none" : p < 120 ? "good" : p < 250 ? "ok" : "bad";

/** Strip Electron's "Error invoking remote method ..." prefix. */
export function errText(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  return msg.replace(/^Error invoking remote method '[^']+': (Error: )?/, "");
}

export const protoLabel: Record<string, string> = {
  vless: "VLESS",
  vmess: "VMess",
  trojan: "Trojan",
  shadowsocks: "SS",
};
