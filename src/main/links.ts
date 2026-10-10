import crypto from "node:crypto";
import type { Protocol, Server } from "../shared/types";

/* ---------------- helpers ---------------- */
export function b64decode(input: string): string {
  let s = input.trim().replace(/-/g, "+").replace(/_/g, "/").replace(/\s+/g, "");
  s += "=".repeat((4 - (s.length % 4)) % 4);
  return Buffer.from(s, "base64").toString("utf8");
}

const safeDecode = (s: string) => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};

const truthy = (v: unknown) => ["1", "true", "tls"].includes(String(v ?? "").toLowerCase());

export interface Parsed {
  protocol: Protocol;
  name: string;
  address: string;
  port: number;
  /** Everything needed to build the Xray outbound */
  params: Record<string, string>;
  secret: string;
}

/* ---------------- share link parsing ---------------- */
export function parseLink(raw: string): Parsed {
  const link = raw.trim();
  const scheme = link.split("://", 1)[0].toLowerCase();

  if (scheme === "vmess") {
    const d = JSON.parse(b64decode(link.slice(8))) as Record<string, unknown>;
    const str = (k: string) => (d[k] == null ? "" : String(d[k]));
    return {
      protocol: "vmess",
      name: str("ps") || str("add"),
      address: str("add"),
      port: Number(d.port) || 443,
      secret: str("id"),
      params: {
        type: str("net") || "tcp",
        security: truthy(d.tls) ? "tls" : "none",
        host: str("host"),
        path: str("path"),
        sni: str("sni"),
        fp: str("fp"),
        alpn: str("alpn"),
        headerType: str("type"),
        serviceName: str("path"),
        aid: str("aid") || "0",
        scy: str("scy") || "auto",
      },
    };
  }

  if (scheme === "vless" || scheme === "trojan") {
    const u = new URL(link);
    const params: Record<string, string> = {};
    u.searchParams.forEach((v, k) => (params[k] = v));
    if (!params.type) params.type = "tcp";
    if (!params.security) params.security = scheme === "trojan" ? "tls" : "none";
    return {
      protocol: scheme,
      name: safeDecode(u.hash.slice(1)) || u.hostname,
      address: u.hostname.replace(/^\[|\]$/g, ""),
      port: Number(u.port) || 443,
      secret: safeDecode(u.username),
      params,
    };
  }

  if (scheme === "ss") {
    // SIP002: ss://base64(method:password)@host:port#name  or  ss://method:password@host:port
    // Legacy: ss://base64(method:password@host:port)#name
    let body = link.slice(5);
    let name = "";
    const hash = body.indexOf("#");
    if (hash >= 0) {
      name = safeDecode(body.slice(hash + 1));
      body = body.slice(0, hash);
    }
    body = body.split("?")[0].replace(/\/$/, "");
    let userinfo: string;
    let hostport: string;
    if (body.includes("@")) {
      const at = body.lastIndexOf("@");
      userinfo = safeDecode(body.slice(0, at));
      hostport = body.slice(at + 1);
      if (!userinfo.includes(":")) userinfo = b64decode(userinfo);
    } else {
      const decoded = b64decode(body);
      const at = decoded.lastIndexOf("@");
      userinfo = decoded.slice(0, at);
      hostport = decoded.slice(at + 1);
    }
    const colon = userinfo.indexOf(":");
    const method = userinfo.slice(0, colon);
    const password = userinfo.slice(colon + 1);
    const pc = hostport.lastIndexOf(":");
    const address = hostport.slice(0, pc).replace(/^\[|\]$/g, "");
    return {
      protocol: "shadowsocks",
      name: name || address,
      address,
      port: Number(hostport.slice(pc + 1)) || 8388,
      secret: password,
      params: { method },
    };
  }

  throw new Error(`Unsupported link type "${scheme}". Use VLESS, VMess, Trojan or Shadowsocks.`);
}

export function transportLabel(p: Parsed): string {
  if (p.protocol === "shadowsocks") return p.params.method || "SS";
  const net = (p.params.type || "tcp").toUpperCase();
  const sec = (p.params.security || "none").toLowerCase();
  const head = p.params.headerType === "http" ? "TCP-HTTP" : net;
  return sec === "none" ? head : `${head} · ${sec === "reality" ? "REALITY" : "TLS"}`;
}

export function toServer(link: string, source: string): Server {
  const p = parseLink(link);
  if (!p.address || !p.port) throw new Error("Missing server address or port");
  return {
    id: crypto.createHash("sha1").update(link.trim()).digest("hex").slice(0, 16),
    name: p.name.slice(0, 80),
    protocol: p.protocol,
    address: p.address,
    port: p.port,
    link: link.trim(),
    source,
    transport: transportLabel(p),
    addedAt: Date.now(),
  };
}

/** Pull every share link out of pasted text or a subscription body (base64 or plain). */
export function extractLinks(text: string): string[] {
  let body = text.trim();
  if (!/(vless|vmess|trojan|ss):\/\//i.test(body)) {
    try {
      body = b64decode(body);
    } catch {
      /* not base64 */
    }
  }
  return body
    .split(/[\r\n\s]+/)
    .map((l) => l.trim())
    .filter((l) => /^(vless|vmess|trojan|ss):\/\//i.test(l));
}

/* ---------------- Xray outbound ---------------- */
function streamSettings(p: Parsed) {
  const q = p.params;
  let net = (q.type || "tcp").toLowerCase();
  if (net === "splithttp") net = "xhttp";
  if (net === "h2") net = "http";
  const security = (q.security || "none").toLowerCase();
  const host = q.host || "";
  const path = q.path || "/";
  const ss: Record<string, unknown> = { network: net, security };

  if (security === "tls") {
    // Xray 26 removed allowInsecure. Insecure servers are handled in core.ts (certificate probe).
    const tls: Record<string, unknown> = { serverName: q.sni || host || p.address };
    if (q.fp && q.fp !== "none") tls.fingerprint = q.fp;
    if (q.alpn) tls.alpn = safeDecode(q.alpn).split(",").map((a) => a.trim()).filter(Boolean);
    else if (net === "ws" || net === "httpupgrade") tls.alpn = ["http/1.1"];
    ss.tlsSettings = tls;
  } else if (security === "reality") {
    ss.realitySettings = {
      serverName: q.sni || "",
      fingerprint: q.fp || "chrome",
      publicKey: q.pbk || "",
      shortId: q.sid || "",
      spiderX: q.spx ? safeDecode(q.spx) : "",
    };
  }

  if (net === "ws") ss.wsSettings = { path, host };
  else if (net === "grpc") ss.grpcSettings = { serviceName: q.serviceName || q.path || "", multiMode: q.mode === "multi" };
  else if (net === "httpupgrade") ss.httpupgradeSettings = { path, host };
  else if (net === "xhttp") ss.xhttpSettings = { path, host, mode: q.mode || "auto" };
  else if (net === "http") ss.httpSettings = { path, host: host ? host.split(",") : [] };
  else if (net === "tcp" && q.headerType === "http") {
    ss.tcpSettings = {
      header: { type: "http", request: { path: [path], headers: { Host: host ? host.split(",") : [] } } },
    };
  }
  return ss;
}

/** True when the link itself says "skip certificate checks" (allowInsecure=1 / insecure=1). */
export function linkAllowsInsecure(link: string): boolean {
  try {
    const q = parseLink(link).params;
    return truthy(q.allowInsecure) || truthy(q.insecure) || truthy(q.allow_insecure);
  } catch {
    return false;
  }
}

export function xrayOutbound(link: string): Record<string, unknown> {
  const p = parseLink(link);
  const q = p.params;
  switch (p.protocol) {
    case "vmess":
      return {
        protocol: "vmess",
        settings: {
          vnext: [{
            address: p.address,
            port: p.port,
            users: [{ id: p.secret, alterId: Number(q.aid) || 0, security: q.scy || "auto" }],
          }],
        },
        streamSettings: streamSettings(p),
      };
    case "vless":
      return {
        protocol: "vless",
        settings: {
          vnext: [{
            address: p.address,
            port: p.port,
            users: [{ id: p.secret, encryption: q.encryption || "none", flow: q.flow || "" }],
          }],
        },
        streamSettings: streamSettings(p),
      };
    case "trojan":
      return {
        protocol: "trojan",
        settings: { servers: [{ address: p.address, port: p.port, password: p.secret }] },
        streamSettings: streamSettings(p),
      };
    case "shadowsocks":
      return {
        protocol: "shadowsocks",
        settings: { servers: [{ address: p.address, port: p.port, method: q.method, password: p.secret }] },
      };
  }
}
