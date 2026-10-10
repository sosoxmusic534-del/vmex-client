import type { Mode, Routing, Settings } from "../shared/types";
import { xrayOutbound } from "./links";
import { PORTS } from "./brand";

const PRIVATE_IPS = [
  "127.0.0.0/8", "10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16",
  "169.254.0.0/16", "100.64.0.0/10", "::1/128", "fc00::/7", "fe80::/10",
];

interface XrayOptions {
  mode: Mode;
  routing: Routing;
  settings: Settings;
  /** Server IP resolved before the tunnel starts (TUN / Apps modes only) */
  resolvedIp?: string;
  /** Extra tlsSettings from the certificate probe (verifyPeerCertByName / pinnedPeerCertSha256) */
  tlsPatch?: Record<string, string | boolean>;
}

/**
 * Xray does the real V2Ray connection (same engine NetMod and v2rayN use).
 * Proxy mode: Windows talks to Xray directly (HTTP on mixedPort, SOCKS on mixedPort + 1).
 * TUN / Apps: sing-box sends traffic into Xray's internal SOCKS port.
 */
export function buildXrayConfig(link: string, { mode, routing, settings, resolvedIp, tlsPatch }: XrayOptions) {
  const outbound = xrayOutbound(link) as {
    settings: Record<string, Array<{ address: string }>>;
    streamSettings?: { tlsSettings?: Record<string, unknown> };
  };

  if (tlsPatch && outbound.streamSettings?.tlsSettings) {
    Object.assign(outbound.streamSettings.tlsSettings, tlsPatch);
  }

  // In tunnel modes connect by IP to avoid a DNS loop. TLS SNI keeps the original hostname.
  if (resolvedIp) {
    for (const key of ["vnext", "servers"]) {
      for (const entry of outbound.settings[key] ?? []) entry.address = resolvedIp;
    }
  }

  const sniff = { enabled: true, destOverride: ["http", "tls", "quic"], routeOnly: true };
  const listen = settings.allowLan ? "0.0.0.0" : "127.0.0.1";

  const inbounds: Record<string, unknown>[] = [
    { tag: "internal-socks", listen: "127.0.0.1", port: PORTS.xraySocks, protocol: "socks", settings: { udp: true, auth: "noauth" }, sniffing: sniff },
    { tag: "internal-http", listen: "127.0.0.1", port: PORTS.xrayHttp, protocol: "http", sniffing: sniff },
  ];
  if (mode === "proxy") {
    inbounds.push(
      { tag: "http-in", listen, port: settings.mixedPort, protocol: "http", sniffing: sniff },
      { tag: "socks-in", listen, port: settings.mixedPort + 1, protocol: "socks", settings: { udp: true, auth: "noauth" }, sniffing: sniff }
    );
  }

  const rules: Record<string, unknown>[] = [{ type: "field", ip: PRIVATE_IPS, outboundTag: "direct" }];
  if (routing === "smart") rules.push({ type: "field", domain: ["domain:lk"], outboundTag: "direct" });

  return {
    log: { loglevel: "warning" },
    inbounds,
    outbounds: [
      { tag: "proxy", ...outbound },
      { tag: "direct", protocol: "freedom" },
    ],
    routing: { domainStrategy: "AsIs", rules },
    // Live speed for the UI: Xray counts bytes on the "proxy" outbound
    stats: {},
    policy: { system: { statsOutboundUplink: true, statsOutboundDownlink: true } },
    metrics: { tag: "metrics", listen: `127.0.0.1:${PORTS.xrayMetrics}` },
  };
}

interface SingBoxOptions {
  mode: Mode;
  routing: Routing;
  settings: Settings;
  coreProcess: string;
  apiSecret: string;
}

/** sing-box gives us the system proxy port or the TUN adapter, per-app routing and live stats. */
export function buildSingBoxConfig({ mode, routing, settings, coreProcess, apiSecret }: SingBoxOptions) {
  const tunnel = mode !== "proxy";
  const apps = settings.apps.filter(Boolean);

  const routeRules: Record<string, unknown>[] = [{ action: "sniff" }];
  if (tunnel) routeRules.push({ protocol: "dns", action: "hijack-dns" });
  // The engine's own traffic must never loop back into the tunnel.
  if (tunnel) routeRules.push({ process_name: [coreProcess], outbound: "direct" });
  routeRules.push({ ip_is_private: true, outbound: "direct" });
  if (routing === "smart") routeRules.push({ domain_suffix: ["lk"], outbound: "direct" });
  if (mode === "apps" && apps.length) routeRules.push({ process_name: apps, outbound: "proxy" });

  const dnsRules: Record<string, unknown>[] = [];
  if (tunnel) dnsRules.push({ process_name: [coreProcess], server: "local" });
  if (routing === "smart") dnsRules.push({ domain_suffix: ["lk"], server: "local" });
  if (mode === "apps" && apps.length) dnsRules.push({ process_name: apps, server: "remote" });

  const inbound = tunnel
    ? {
        type: "tun",
        tag: "tun-in",
        interface_name: "VMEX",
        address: ["172.19.0.1/30", "fdfe:dcba:9876::1/126"],
        mtu: 9000,
        auto_route: true,
        strict_route: true,
        stack: "mixed",
      }
    : {
        type: "mixed",
        tag: "mixed-in",
        listen: settings.allowLan ? "0.0.0.0" : "127.0.0.1",
        listen_port: settings.mixedPort,
      };

  return {
    log: { level: "warn", timestamp: true },
    dns: {
      servers: [
        { type: "tcp", tag: "remote", server: settings.remoteDns || "1.1.1.1", detour: "proxy" },
        { type: "local", tag: "local" },
      ],
      rules: dnsRules,
      final: tunnel && mode !== "apps" ? "remote" : "local",
      strategy: "prefer_ipv4",
    },
    inbounds: [inbound],
    outbounds: [
      { type: "socks", tag: "proxy", server: "127.0.0.1", server_port: PORTS.xraySocks, version: "5" },
      { type: "direct", tag: "direct" },
    ],
    route: {
      rules: routeRules,
      final: mode === "apps" ? "direct" : "proxy",
      auto_detect_interface: tunnel,
      default_domain_resolver: "local",
    },
    experimental: {
      clash_api: { external_controller: `127.0.0.1:${PORTS.clashApi}`, secret: apiSecret },
    },
  };
}
