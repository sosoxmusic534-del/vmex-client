import type { ReactNode } from "react";
import type { Routing, Settings as S } from "../../../shared/types";
import Icon, { type IconName } from "../components/Icon";
import { useApp } from "../lib/store";

function Row({ icon, title, desc, children }: { icon: IconName; title: string; desc: string; children: ReactNode }) {
  return (
    <div className="set-row">
      <span className="set-icon"><Icon name={icon} size={17} /></span>
      <div className="set-text">
        <b>{title}</b>
        <small>{desc}</small>
      </div>
      <div className="set-ctl">{children}</div>
    </div>
  );
}

function Switch({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} className={`switch${on ? " is-on" : ""}`} onClick={() => onChange(!on)}>
      <span />
    </button>
  );
}

const ROUTING: { id: Routing; label: string }[] = [
  { id: "global", label: "Global" },
  { id: "smart", label: "Smart" },
];

export default function Settings() {
  const settings = useApp((s) => s.settings)!;
  const info = useApp((s) => s.info);
  const status = useApp((s) => s.status);
  const { setSettings, toast } = useApp.getState();
  const set = (patch: Partial<S>) => void setSettings(patch).then(() => {
    if (status.state === "connected") toast("Saved. Reconnect to apply.");
  });

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h2>Settings</h2>
          <p>Make VMEX work the way you like.</p>
        </div>
      </div>

      <h4 className="set-group">Connection</h4>
      <section className="panel set-panel">
        <Row icon="route" title="Routing" desc="Global sends everything through VMEX. Smart keeps Sri Lankan (.lk) sites and local networks direct.">
          <div className="seg">
            {ROUTING.map((r) => (
              <button key={r.id} type="button" className={settings.routing === r.id ? "is-active" : ""} onClick={() => set({ routing: r.id })}>
                {r.label}
              </button>
            ))}
          </div>
        </Row>
        <Row icon="globe" title="Remote DNS" desc="DNS server used through the tunnel in Whole PC mode.">
          <select value={settings.remoteDns} onChange={(e) => set({ remoteDns: e.target.value })}>
            <option value="1.1.1.1">Cloudflare 1.1.1.1</option>
            <option value="8.8.8.8">Google 8.8.8.8</option>
            <option value="9.9.9.9">Quad9 9.9.9.9</option>
          </select>
        </Row>
        <Row icon="link" title="Local proxy port" desc="Proxy mode sets Windows to use 127.0.0.1 on this port.">
          <input
            className="port"
            type="number"
            min={1024}
            max={65000}
            value={settings.mixedPort}
            onChange={(e) => set({ mixedPort: Math.min(65000, Math.max(1024, Number(e.target.value) || 10808)) })}
          />
        </Row>
        <Row icon="monitor" title="Share with your network" desc="Let other devices on your Wi-Fi use this PC's proxy port.">
          <Switch on={settings.allowLan} onChange={(v) => set({ allowLan: v })} />
        </Row>
        <Row icon="shield" title="Skip certificate check" desc="Like NetMod: connect even if the server's TLS certificate is self-signed or for another name.">
          <Switch on={settings.allowInsecure} onChange={(v) => set({ allowInsecure: v })} />
        </Row>
      </section>

      <h4 className="set-group">General</h4>
      <section className="panel set-panel">
        <Row icon="power" title="Connect on start" desc="Connect to your last server when VMEX opens.">
          <Switch on={settings.autoConnect} onChange={(v) => set({ autoConnect: v })} />
        </Row>
        <Row icon="home" title="Start with Windows" desc="Open VMEX in the tray when you sign in.">
          <Switch on={settings.startWithWindows} onChange={(v) => set({ startWithWindows: v })} />
        </Row>
        <Row icon="minimize" title="Close to tray" desc="Keep VMEX running in the tray when you close the window.">
          <Switch on={settings.closeToTray} onChange={(v) => set({ closeToTray: v })} />
        </Row>
        <Row icon="discord" title="Discord status" desc='Show "Playing VMEX" on your Discord while connected.'>
          <Switch on={settings.discordStatus} onChange={(v) => set({ discordStatus: v })} />
        </Row>
      </section>

      <h4 className="set-group">About</h4>
      <section className="panel set-panel">
        <Row icon="info" title={`VMEX ${info?.version ?? ""}`} desc={`Xray ${info?.cores.xray ?? "?"} · sing-box ${info?.cores.singbox ?? "?"}${info?.cores.ready ? "" : " · engines missing"}`}>
          <button type="button" className="btn btn--ghost btn--small" onClick={() => window.vmex.app.openDataDir()}>
            <Icon name="folder" size={14} /> Data folder
          </button>
        </Row>
        <Row icon="shield" title={status.isAdmin ? "Running as administrator" : "Running as a normal user"} desc="Whole PC and Apps only modes need administrator rights.">
          {!status.isAdmin && (
            <button type="button" className="btn btn--ghost btn--small" onClick={() => void window.vmex.vpn.relaunchAsAdmin()}>
              Restart as admin
            </button>
          )}
        </Row>
      </section>
      <p className="credits">Powered by Xray-core (MPL-2.0) and sing-box (GPL-3.0).</p>
    </div>
  );
}
