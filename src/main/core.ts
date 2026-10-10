import { app } from "electron";
import { ChildProcess, execFileSync, spawn } from "node:child_process";
import crypto from "node:crypto";
import dns from "node:dns/promises";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import tls from "node:tls";
import type { Mode, Server, Settings, Status, Traffic } from "../shared/types";
import { PORTS } from "./brand";
import { buildSingBoxConfig, buildXrayConfig } from "./config";
import { linkAllowsInsecure } from "./links";
import { log } from "./logs";
import { dataDir } from "./store";
import { isAdmin, setSystemProxy, waitForPort } from "./system";

export const CORE_EXE = "vmex-core.exe"; // Xray
export const TUN_EXE = "vmex-tun.exe"; // sing-box (only for Whole PC / Apps modes)

export const coreDir = () =>
  app.isPackaged ? path.join(process.resourcesPath, "core") : path.join(app.getAppPath(), "resources", "core");

export function coreVersions() {
  const dir = coreDir();
  let v: { xray?: string; singbox?: string } = {};
  try {
    v = JSON.parse(fs.readFileSync(path.join(dir, "versions.json"), "utf8"));
  } catch {
    /* no versions file */
  }
  const ready = fs.existsSync(path.join(dir, CORE_EXE));
  return { xray: v.xray ?? null, singbox: v.singbox ?? null, ready };
}

/** Xray major version (25, 26, ...). Xray 26 removed allowInsecure; older ones need it. */
let xrayMajorCache: number | null = null;
export function xrayMajor(): number {
  if (xrayMajorCache !== null) return xrayMajorCache;
  try {
    const out = execFileSync(path.join(coreDir(), CORE_EXE), ["version"], { windowsHide: true, timeout: 5000 }).toString();
    const m = /Xray (\d+)\./.exec(out);
    xrayMajorCache = m ? Number(m[1]) : 26;
    log("app", `Engine: ${out.split(/\r?\n/)[0]}`);
  } catch {
    xrayMajorCache = 26;
  }
  return xrayMajorCache;
}

/**
 * Real end-to-end test through Xray: CONNECT www.gstatic.com:443 → TLS → GET /generate_204.
 * Returns the delay in ms, or throws with a readable reason.
 */
export function realDelay(timeoutMs = 8000): Promise<number> {
  return new Promise((resolve, reject) => {
    const start = performance.now();
    const host = "www.gstatic.com";
    const sock = net.connect(PORTS.xrayHttp, "127.0.0.1");
    let stage: "connect" | "tls" = "connect";
    let buf = "";
    const fail = (why: string) => {
      sock.destroy();
      reject(new Error(why));
    };
    const timer = setTimeout(() => fail("The server didn't answer in time"), timeoutMs);
    sock.once("error", () => fail("Couldn't reach the local engine"));
    sock.once("connect", () => sock.write(`CONNECT ${host}:443 HTTP/1.1\r\nHost: ${host}:443\r\n\r\n`));
    sock.on("data", (chunk) => {
      if (stage !== "connect") return;
      buf += chunk.toString("latin1");
      if (!buf.includes("\r\n\r\n")) return;
      if (!/^HTTP\/1\.[01] 200/.test(buf)) return fail("The server refused the connection");
      stage = "tls";
      sock.removeAllListeners("data");
      const secure = tls.connect({ socket: sock, servername: host }, () => {
        secure.write(`GET /generate_204 HTTP/1.1\r\nHost: ${host}\r\nConnection: close\r\n\r\n`);
      });
      let res = "";
      secure.on("data", (d) => {
        res += d.toString("latin1");
        if (/^HTTP\/1\.[01] (204|200)/.test(res)) {
          clearTimeout(timer);
          resolve(Math.round(performance.now() - start));
          secure.destroy();
        }
      });
      secure.once("error", () => {
        clearTimeout(timer);
        fail("The server connection was closed. The config may be wrong or expired.");
      });
    });
  });
}

/**
 * Look at the certificate the server really presents (without trusting it).
 *  kind "ok"        -> nothing to do
 *  kind "name"      -> trusted certificate, but for another name (sg2 serving in1's cert)
 *  kind "untrusted" -> self-signed / unknown CA / expired
 */
type CertProbe = { kind: "ok" | "name" | "untrusted"; names: string[]; sha256: string; reason: string };

function probeCertificate(host: string, port: number, sni: string): Promise<CertProbe> {
  return new Promise((resolve, reject) => {
    const sock = tls.connect({ host, port, servername: net.isIP(sni) ? undefined : sni, rejectUnauthorized: false, timeout: 7000 });
    const fail = (why: string) => {
      sock.destroy();
      reject(new Error(why));
    };
    sock.once("timeout", () => fail(`no TLS answer from ${host}:${port}`));
    sock.once("error", (e) => fail(`TLS to ${host}:${port} failed: ${e.message}`));
    sock.once("secureConnect", () => {
      const cert = sock.getPeerCertificate();
      sock.destroy();
      if (!cert || !cert.raw) return reject(new Error("the server sent no certificate"));
      const names = (cert.subjectaltname ?? "")
        .split(",").map((x) => x.trim())
        .filter((x) => x.startsWith("DNS:")).map((x) => x.slice(4));
      if (!names.length && typeof cert.subject?.CN === "string") names.push(cert.subject.CN);
      const sha256 = crypto.createHash("sha256").update(cert.raw).digest("hex");
      const code = String(sock.authorizationError ?? "");
      const kind = sock.authorized ? "ok" : code === "ERR_TLS_CERT_ALTNAME_INVALID" ? "name" : "untrusted";
      resolve({ kind, names, sha256, reason: code });
    });
  });
}

class Engine extends EventEmitter {
  private xray: ChildProcess | null = null;
  private tun: ChildProcess | null = null;
  private statsTimer: NodeJS.Timeout | null = null;
  private proxyOn = false;
  private stopping = false;
  private secret = "";
  private totals = { up: 0, down: 0 };
  private last: { up: number; down: number; t: number } | null = null;
  /** What Xray was started with, so it can be restarted with a certificate fix */
  private ctx: { server: Server; settings: Settings; mode: Mode; resolvedIp?: string; file: string } | null = null;
  private tlsPatch: Record<string, string | boolean> | undefined;
  private healing = false;

  status: Status = {
    state: "idle",
    mode: "proxy",
    serverId: null,
    serverName: null,
    since: null,
    error: null,
    isAdmin: false,
  };

  private setStatus(patch: Partial<Status>) {
    this.status = { ...this.status, ...patch, isAdmin: isAdmin() };
    this.emit("status", this.status);
  }

  private spawnEngine(exe: string, args: string[], src: "core" | "tun") {
    const file = path.join(coreDir(), exe);
    if (!fs.existsSync(file)) {
      throw new Error(
        `${exe} is missing from ${coreDir()}. Run "npm run fetch-core" (or reinstall VMEX). If Windows Defender removed it, allow it in Protection history.`
      );
    }
    const child = spawn(file, args, { cwd: coreDir(), windowsHide: true });
    const pipe = (buf: Buffer) =>
      buf.toString().split(/\r?\n/).forEach((l) => {
        if (!l.trim()) return;
        log(src, l);
        if (src !== "core") return;
        if (/x509:|tls: failed to verify certificate/.test(l)) void this.healCertificate(l);
      });
    child.stdout?.on("data", pipe);
    child.stderr?.on("data", pipe);
    child.on("error", (e) => log(src, `Couldn't start ${exe}: ${e.message}`, "error"));
    child.on("exit", (code) => {
      log(src, `${src === "core" ? "Xray" : "sing-box"} stopped (code ${code})`, code ? "warn" : "info");
      if (src === "core" && this.healing) return; // planned restart
      if (!this.stopping && this.status.state === "connected") {
        void this.stop(`The ${src === "core" ? "Xray engine" : "tunnel"} stopped unexpectedly. Check Logs for details.`);
      }
    });
    return child;
  }

  async start(server: Server, settings: Settings): Promise<Status> {
    if (this.status.state === "connecting" || this.status.state === "connected") await this.stop();
    const mode: Mode = settings.mode;
    const tunnel = mode !== "proxy";

    if (tunnel && !isAdmin()) {
      throw new Error("Whole PC and Apps modes need administrator rights. Restart VMEX as administrator.");
    }
    if (mode === "apps" && !settings.apps.length) {
      throw new Error("Add at least one app in the Apps page first.");
    }

    this.stopping = false;
    this.totals = { up: 0, down: 0 };
    this.last = null;
    this.secret = crypto.randomBytes(16).toString("hex");
    this.setStatus({ state: "connecting", mode, serverId: server.id, serverName: server.name, error: null, since: null });
    log("app", `Connecting to ${server.name} (${mode} mode)`);

    try {
      const runDir = path.join(dataDir(), "run");
      fs.mkdirSync(runDir, { recursive: true });

      // Tunnel modes: resolve the server before the tunnel exists, so it never resolves through itself.
      let resolvedIp: string | undefined;
      if (tunnel && !net.isIP(server.address)) {
        try {
          resolvedIp = (await dns.lookup(server.address, { family: 4 })).address;
        } catch {
          throw new Error(`Couldn't find the server "${server.address}". Check your internet connection.`);
        }
      }

      // 0) Check the server's TLS certificate (NetMod skips this; Xray 26 does not)
      this.tlsPatch = await this.certificateFix(server, settings, resolvedIp);

      // 1) Xray: the real V2Ray client
      this.ctx = { server, settings, mode, resolvedIp, file: path.join(runDir, "xray.json") };
      await this.launchXray();

      // 2) sing-box: only for Whole PC / Apps (TUN adapter + per-app rules)
      if (tunnel) {
        if (!fs.existsSync(path.join(coreDir(), TUN_EXE))) {
          throw new Error(`${TUN_EXE} is missing. Run "npm run fetch-core" or use Proxy mode.`);
        }
        const sbFile = path.join(runDir, "sing-box.json");
        const sbConfig = buildSingBoxConfig({ mode, routing: settings.routing, settings, coreProcess: CORE_EXE, apiSecret: this.secret });
        fs.writeFileSync(sbFile, JSON.stringify(sbConfig, null, 2));
        this.tun = this.spawnEngine(TUN_EXE, ["run", "-c", sbFile, "-D", runDir, "--disable-color"], "tun");
        if (!(await waitForPort(PORTS.clashApi, 15000, () => this.tun?.exitCode === null))) {
          throw new Error("The tunnel failed to start. Open Logs to see why.");
        }
      } else {
        // 3) Proxy mode: point Windows at Xray's HTTP port
        await setSystemProxy(settings.mixedPort);
        this.proxyOn = true;
      }

      this.startStats();
      this.setStatus({ state: "connected", since: Date.now() });
      log("app", `Connected: ${server.name}`);
      void this.checkInternet();
      return this.status;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      log("app", msg, "error");
      await this.stop(msg);
      throw new Error(msg);
    }
  }

  /**
   * Decide how Xray should treat this server's certificate. NetMod/v2rayN skip the check;
   * Xray 26 removed that switch, so we pin the exact certificate the server sends instead.
   */
  private async certificateFix(server: Server, settings: Settings, resolvedIp?: string): Promise<Record<string, string | boolean> | undefined> {
    const plain = buildXrayConfig(server.link, { mode: settings.mode, routing: settings.routing, settings, resolvedIp });
    const out = (plain.outbounds as Array<{ tag?: string; streamSettings?: { security?: string; tlsSettings?: { serverName?: string } } }>)
      .find((o) => o.tag === "proxy");
    const sni = out?.streamSettings?.tlsSettings?.serverName;
    if (out?.streamSettings?.security !== "tls" || !sni) return undefined;
    const allow = settings.allowInsecure || linkAllowsInsecure(server.link);
    const old = xrayMajor() < 26;

    let cert: CertProbe;
    try {
      cert = await probeCertificate(resolvedIp ?? server.address, server.port, sni);
    } catch (e) {
      log("app", `Certificate check skipped (${(e as Error).message}).`, "warn");
      return old && allow ? { allowInsecure: true } : undefined;
    }
    if (cert.kind === "ok") return undefined;

    const shown = cert.names.join(", ") || "unknown";
    log("app", `Server certificate problem (${cert.kind === "name" ? `issued for "${shown}", link uses "${sni}"` : cert.reason}).`, "warn");
    // A certificate for another name is accepted like NetMod does; untrusted ones need the setting.
    if (cert.kind === "untrusted" && !allow) {
      throw new Error(`The server certificate isn't trusted (${cert.reason}). Turn on "Skip certificate check" in Settings to use it anyway.`);
    }
    if (old) {
      log("app", "Skipping certificate check (allowInsecure).", "warn");
      return { allowInsecure: true };
    }
    log("app", `Pinned the server certificate (sha256 ${cert.sha256.slice(0, 16)}...).`, "warn");
    return { pinnedPeerCertSha256: cert.sha256 };
  }

  /** Write the Xray config (with any certificate fix) and start Xray. */
  private async launchXray() {
    const c = this.ctx!;
    const cfg = buildXrayConfig(c.server.link, { mode: c.mode, routing: c.settings.routing, settings: c.settings, resolvedIp: c.resolvedIp, tlsPatch: this.tlsPatch });
    fs.writeFileSync(c.file, JSON.stringify(cfg, null, 2));
    this.xray = this.spawnEngine(CORE_EXE, ["run", "-c", c.file], "core");
    const port = c.mode === "proxy" ? c.settings.mixedPort : PORTS.xraySocks;
    if (!(await waitForPort(port, 8000, () => this.xray?.exitCode === null))) {
      throw new Error(
        this.xray?.exitCode !== null
          ? "Xray refused this config. Open Logs to see why."
          : `Port ${port} is busy. Close other VPN apps (NetMod, v2rayN) or change the port in Settings.`
      );
    }
  }

  /** Backup plan: Xray reported a certificate error, so check the certificate now and restart Xray with the fix. */
  private async healCertificate(line: string) {
    if (this.healing || this.stopping || !this.ctx || !this.xray) return;
    if (this.tlsPatch && (this.tlsPatch.pinnedPeerCertSha256 || this.tlsPatch.allowInsecure)) return; // already fixed
    this.healing = true;
    try {
      const { server, settings, resolvedIp } = this.ctx;
      const untrusted = /unknown authority|self.signed|expired/.test(line);
      const fix = await this.certificateFix(server, untrusted ? settings : { ...settings, allowInsecure: true }, resolvedIp).catch((e) => {
        if (this.status.state === "connected") this.setStatus({ error: (e as Error).message });
        return undefined;
      });
      if (!fix) return;
      log("app", "Restarting Xray with the certificate fix.", "warn");
      this.tlsPatch = fix;
      const old = this.xray;
      old.kill();
      await new Promise<void>((r) => {
        if (old.exitCode !== null) return r();
        const t = setTimeout(r, 2500);
        old.once("exit", () => {
          clearTimeout(t);
          r();
        });
      });
      this.last = null;
      await this.launchXray();
      if (this.status.state === "connected") {
        this.setStatus({ error: null });
        void this.checkInternet();
      }
    } catch (e) {
      void this.stop((e as Error).message);
    } finally {
      this.healing = false;
    }
  }

  /** After connecting, prove the server really works and report the real delay. */
  private async checkInternet() {
    try {
      const ms = await realDelay();
      log("app", `Internet check OK through ${this.status.serverName}: ${ms} ms`);
      this.emit("delay", { serverId: this.status.serverId, ms });
    } catch (e) {
      if (this.status.state !== "connected") return;
      const msg = `Connected, but no internet through this server: ${(e as Error).message}. Check the config, your data package, or try another server.`;
      log("app", msg, "error");
      this.setStatus({ error: msg });
    }
  }

  async stop(error: string | null = null): Promise<Status> {
    this.stopping = true;
    if (this.status.state === "connected" || this.status.state === "connecting") {
      this.setStatus({ state: "disconnecting" });
    }
    if (this.statsTimer) clearInterval(this.statsTimer);
    this.statsTimer = null;
    if (this.proxyOn) {
      try {
        await setSystemProxy(null);
      } catch (e) {
        log("app", `Couldn't turn off the system proxy: ${(e as Error).message}`, "warn");
      }
      this.proxyOn = false;
    }
    for (const child of [this.tun, this.xray]) {
      if (child && child.exitCode === null) {
        child.kill();
        await new Promise<void>((r) => {
          const t = setTimeout(r, 2500);
          child.once("exit", () => {
            clearTimeout(t);
            r();
          });
        });
      }
    }
    this.tun = null;
    this.xray = null;
    this.emit("traffic", { up: 0, down: 0, totalUp: this.totals.up, totalDown: this.totals.down } satisfies Traffic);
    this.setStatus({ state: error ? "error" : "idle", since: null, error });
    if (!error) log("app", "Disconnected");
    return this.status;
  }

  /** Read Xray's byte counters every second and turn them into speed. */
  private startStats() {
    this.statsTimer = setInterval(async () => {
      try {
        const res = await fetch(`http://127.0.0.1:${PORTS.xrayMetrics}/debug/vars`, { signal: AbortSignal.timeout(900) });
        const data = (await res.json()) as { stats?: { outbound?: Record<string, { uplink: number; downlink: number }> } };
        const proxy = data.stats?.outbound?.proxy;
        if (!proxy) return;
        const now = Date.now();
        if (this.last) {
          const dt = Math.max((now - this.last.t) / 1000, 0.001);
          const up = Math.max(0, (proxy.uplink - this.last.up) / dt);
          const down = Math.max(0, (proxy.downlink - this.last.down) / dt);
          this.totals = { up: proxy.uplink, down: proxy.downlink };
          this.emit("traffic", { up, down, totalUp: proxy.uplink, totalDown: proxy.downlink } satisfies Traffic);
        }
        this.last = { up: proxy.uplink, down: proxy.downlink, t: now };
      } catch {
        /* engine busy — try next second */
      }
    }, 1000);
  }

  killNow() {
    for (const child of [this.tun, this.xray]) {
      try {
        child?.kill();
      } catch {
        /* ignore */
      }
    }
  }

  get proxyActive() {
    return this.proxyOn;
  }
}

export const engine = new Engine();
