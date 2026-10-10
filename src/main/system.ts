import { app } from "electron";
import { execFile, spawn, spawnSync } from "node:child_process";
import net from "node:net";
import type { ProcessInfo } from "../shared/types";

const isWin = process.platform === "win32";

/* ---------------- Administrator ---------------- */
let adminCache: boolean | null = null;
export function isAdmin(): boolean {
  if (!isWin) return typeof process.getuid === "function" && process.getuid() === 0;
  if (adminCache === null) {
    adminCache = spawnSync("net", ["session"], { windowsHide: true, stdio: "ignore" }).status === 0;
  }
  return adminCache;
}

/** Restart VMEX with administrator rights (needed for the TUN adapter). */
export function relaunchAsAdmin(extraArgs: string[] = []): Promise<boolean> {
  return new Promise((resolve) => {
    if (!isWin) return resolve(false);
    const args = [...process.argv.slice(1), ...extraArgs].map((a) => `'${a.replace(/'/g, "''")}'`).join(",");
    const cmd = `Start-Process -FilePath '${process.execPath.replace(/'/g, "''")}'${args ? ` -ArgumentList ${args}` : ""} -Verb RunAs`;
    execFile("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", cmd], { windowsHide: true }, (err) =>
      resolve(!err)
    );
  });
}

/* ---------------- Windows system proxy ---------------- */
const INET = "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings";
const REFRESH = `
$sig = '[DllImport("wininet.dll", SetLastError=true)] public static extern bool InternetSetOption(IntPtr h, int o, IntPtr b, int l);'
$t = Add-Type -MemberDefinition $sig -Name WinInet -Namespace VMEX -PassThru
[void]$t::InternetSetOption([IntPtr]::Zero, 39, [IntPtr]::Zero, 0)
[void]$t::InternetSetOption([IntPtr]::Zero, 37, [IntPtr]::Zero, 0)
`;

function powershell(script: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = spawn("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", "-"], { windowsHide: true });
    let out = "";
    let err = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("error", reject);
    p.on("close", (code) => (code === 0 ? resolve(out.trim()) : reject(new Error(err.trim() || `powershell exit ${code}`))));
    p.stdin.end(script);
  });
}

export async function setSystemProxy(port: number | null) {
  if (!isWin) return;
  const script = port
    ? `Set-ItemProperty -Path '${INET}' -Name ProxyEnable -Value 1
Set-ItemProperty -Path '${INET}' -Name ProxyServer -Value '127.0.0.1:${port}'
Set-ItemProperty -Path '${INET}' -Name ProxyOverride -Value 'localhost;127.*;10.*;172.16.*;192.168.*;<local>'
${REFRESH}`
    : `Set-ItemProperty -Path '${INET}' -Name ProxyEnable -Value 0
${REFRESH}`;
  await powershell(script);
}

/** If VMEX crashed while the proxy was on, turn it off again on the next start. */
export async function clearStaleProxy(port: number) {
  if (!isWin) return;
  try {
    const current = await powershell(
      `$p = Get-ItemProperty -Path '${INET}'; "$($p.ProxyEnable)|$($p.ProxyServer)"`
    );
    const [enabled, server] = current.split("|");
    if (enabled === "1" && server === `127.0.0.1:${port}`) await setSystemProxy(null);
  } catch {
    /* ignore */
  }
}

/* ---------------- Running processes (for per-app mode) ---------------- */
export function listProcesses(): Promise<ProcessInfo[]> {
  return new Promise((resolve) => {
    if (!isWin) return resolve([]);
    execFile("tasklist", ["/fo", "csv", "/nh"], { windowsHide: true, maxBuffer: 8 * 1024 * 1024 }, (err, stdout) => {
      if (err) return resolve([]);
      const counts = new Map<string, number>();
      for (const line of stdout.split(/\r?\n/)) {
        const m = line.match(/^"([^"]+)"/);
        if (m && m[1].toLowerCase().endsWith(".exe")) counts.set(m[1], (counts.get(m[1]) ?? 0) + 1);
      }
      const skip = /^(svchost|system|registry|smss|csrss|wininit|services|lsass|winlogon|fontdrvhost|dwm|conhost|sihost|ctfmon|runtimebroker|dllhost|searchhost|startmenuexperiencehost|textinputhost|taskhostw|vmex-core|vmex-tun)\.exe$/i;
      resolve(
        [...counts.entries()]
          .filter(([name]) => !skip.test(name))
          .map(([name, count]) => ({ name, count }))
          .sort((a, b) => a.name.localeCompare(b.name))
      );
    });
  });
}

/* ---------------- TCP ping ---------------- */
export function tcpPing(host: string, port: number, timeout = 3000): Promise<number | null> {
  return new Promise((resolve) => {
    const start = performance.now();
    const socket = net.connect({ host, port, timeout });
    const done = (ms: number | null) => {
      socket.destroy();
      resolve(ms);
    };
    socket.once("connect", () => done(Math.round(performance.now() - start)));
    socket.once("timeout", () => done(null));
    socket.once("error", () => done(null));
  });
}

/** Wait until a local TCP port accepts connections. */
export async function waitForPort(port: number, ms: number, alive: () => boolean): Promise<boolean> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (!alive()) return false;
    if ((await tcpPing("127.0.0.1", port, 400)) !== null) return true;
    await new Promise((r) => setTimeout(r, 150));
  }
  return false;
}

export const appVersion = () => app.getVersion();
