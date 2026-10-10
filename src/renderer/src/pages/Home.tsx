import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import type { Mode } from "../../../shared/types";
import ConnectOrb from "../components/ConnectOrb";
import Icon, { type IconName } from "../components/Icon";
import ImportModal from "../components/ImportModal";
import SpeedChart from "../components/SpeedChart";
import { bytes, elapsed, errText, pingTone, protoLabel, speed } from "../lib/format";
import { selectedServer, useApp } from "../lib/store";

const MODES: { id: Mode; label: string; desc: string; icon: IconName }[] = [
  { id: "proxy", label: "Proxy", desc: "Browsers and most apps", icon: "globe" },
  { id: "tun", label: "Whole PC", desc: "Every app and game", icon: "monitor" },
  { id: "apps", label: "Apps only", desc: "Just the apps you pick", icon: "target" },
];

function useNow(active: boolean) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

export default function Home() {
  const status = useApp((s) => s.status);
  const traffic = useApp((s) => s.traffic);
  const down = useApp((s) => s.downHistory);
  const up = useApp((s) => s.upHistory);
  const settings = useApp((s) => s.settings)!;
  const server = useApp(selectedServer);
  const servers = useApp((s) => s.servers);
  const busy = useApp((s) => s.busy);
  const { toggle, setSettings, go, toast, connect } = useApp.getState();
  const [importOpen, setImportOpen] = useState(false);
  const [pinging, setPinging] = useState(false);

  const connected = status.state === "connected";
  const now = useNow(connected);
  const needsAdmin = settings.mode !== "proxy" && !status.isAdmin;

  const chooseMode = async (mode: Mode) => {
    if (mode === settings.mode) return;
    await setSettings({ mode });
    if (connected && (mode === "proxy" || status.isAdmin)) await connect();
  };

  const ping = async () => {
    if (!server) return;
    setPinging(true);
    try {
      await window.vmex.servers.ping([server.id]);
    } catch (e) {
      toast(errText(e), "bad");
    } finally {
      setPinging(false);
    }
  };

  const headline =
    status.state === "connected" ? "Protected" :
    status.state === "connecting" ? "Connecting" :
    status.state === "disconnecting" ? "Disconnecting" :
    status.state === "error" ? "Connection failed" : "Not protected";

  return (
    <div className="page home">
      <section className="hero-card">
        <div className="hero-glow" />
        <ConnectOrb state={status.state} busy={busy} onClick={() => (server ? void toggle() : setImportOpen(true))} />

        <AnimatePresence mode="wait">
          <motion.div
            key={headline}
            className="hero-text"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25 }}
          >
            <h1 className={`state-title state-title--${status.state}`}>{headline}</h1>
            <p className="state-sub">
              {connected && status.error
                ? "Connected, but the server isn't answering. See Logs."
                : connected && status.since
                ? `${elapsed(now - status.since)} · ${status.mode === "proxy" ? "Proxy mode" : status.mode === "tun" ? "Whole PC" : `${settings.apps.length} apps`}`
                : status.state === "error"
                  ? status.error
                  : server
                    ? "Tap the button to connect"
                    : "Add a server to get started"}
            </p>
          </motion.div>
        </AnimatePresence>

        {server ? (
          <button type="button" className="server-pill" onClick={() => go("servers")}>
            <span className={`proto proto--${server.protocol}`}>{protoLabel[server.protocol]}</span>
            <span className="server-pill-name">{server.name}</span>
            <Icon name="servers" size={15} />
          </button>
        ) : (
          <button type="button" className="btn btn--primary" onClick={() => setImportOpen(true)}>
            <Icon name="plus" size={16} /> Add a server
          </button>
        )}
      </section>

      <div className="home-side">
        <section className="panel">
          <div className="panel-head">
            <h3>Mode</h3>
            {needsAdmin && <span className="badge badge--warn">Needs administrator</span>}
          </div>
          <div className="modes">
            {MODES.map((m) => (
              <motion.button
                key={m.id}
                type="button"
                className={`mode${settings.mode === m.id ? " is-active" : ""}`}
                onClick={() => void chooseMode(m.id)}
                whileHover={{ y: -2 }}
                whileTap={{ scale: 0.97 }}
              >
                <Icon name={m.icon} size={20} />
                <b>{m.label}</b>
                <small>{m.desc}</small>
              </motion.button>
            ))}
          </div>
          {needsAdmin && (
            <div className="notice">
              <Icon name="shield" size={16} />
              <span>This mode creates a virtual network adapter, so Windows needs administrator rights.</span>
              <button type="button" className="btn btn--small" onClick={() => void window.vmex.vpn.relaunchAsAdmin()}>
                Restart as admin
              </button>
            </div>
          )}
          {settings.mode === "apps" && !needsAdmin && (
            <div className="notice notice--info">
              <Icon name="gamepad" size={16} />
              <span>{settings.apps.length ? `${settings.apps.length} apps go through VMEX. Everything else stays direct.` : "Pick the apps that should use VMEX."}</span>
              <button type="button" className="btn btn--small" onClick={() => go("apps")}>Choose apps</button>
            </div>
          )}
        </section>

        <div className="stats">
          <Stat icon="down" label="Download" value={connected ? speed(traffic.down) : "0 B/s"} sub={`${bytes(traffic.totalDown)} this session`} tone="accent" />
          <Stat icon="up" label="Upload" value={connected ? speed(traffic.up) : "0 B/s"} sub={`${bytes(traffic.totalUp)} this session`} tone="cyan" />
          <button type="button" className="stat stat--button" onClick={() => void ping()} disabled={!server || pinging}>
            <span className="stat-label"><Icon name="signal" size={14} /> Ping</span>
            <b className={`ping ping--${pingTone(server?.ping)}`}>{pinging ? "..." : server?.ping != null ? `${server.ping} ms` : "--"}</b>
            <small>{pinging ? "Testing" : "Tap to test"}</small>
          </button>
          <Stat icon="servers" label="Servers" value={String(servers.length)} sub={settings.routing === "smart" ? "Smart routing" : "Global routing"} />
        </div>

        <section className="panel panel--chart">
          <div className="panel-head">
            <h3>Live speed</h3>
            <div className="legend">
              <span><i className="legend-down" /> Download</span>
              <span><i className="legend-up" /> Upload</span>
            </div>
          </div>
          <SpeedChart down={down} up={up} />
        </section>
      </div>

      <ImportModal open={importOpen} onClose={() => setImportOpen(false)} />
    </div>
  );
}

function Stat({ icon, label, value, sub, tone }: { icon: IconName; label: string; value: string; sub: string; tone?: string }) {
  return (
    <div className={`stat${tone ? ` stat--${tone}` : ""}`}>
      <span className="stat-label"><Icon name={icon} size={14} /> {label}</span>
      <motion.b key={value} initial={{ opacity: 0.4 }} animate={{ opacity: 1 }}>{value}</motion.b>
      <small>{sub}</small>
    </div>
  );
}
