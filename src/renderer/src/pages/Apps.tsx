import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import type { ProcessInfo } from "../../../shared/types";
import Icon from "../components/Icon";
import { useApp } from "../lib/store";

const POPULAR: { name: string; exe: string }[] = [
  { name: "Minecraft (Java)", exe: "javaw.exe" },
  { name: "Roblox", exe: "RobloxPlayerBeta.exe" },
  { name: "Valorant", exe: "VALORANT-Win64-Shipping.exe" },
  { name: "Counter-Strike 2", exe: "cs2.exe" },
  { name: "Fortnite", exe: "FortniteClient-Win64-Shipping.exe" },
  { name: "PUBG", exe: "TslGame.exe" },
  { name: "Discord", exe: "Discord.exe" },
  { name: "Chrome", exe: "chrome.exe" },
  { name: "Edge", exe: "msedge.exe" },
  { name: "Telegram", exe: "Telegram.exe" },
];

export default function Apps() {
  const settings = useApp((s) => s.settings)!;
  const status = useApp((s) => s.status);
  const { setSettings, toast, connect } = useApp.getState();
  const [procs, setProcs] = useState<ProcessInfo[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [dirty, setDirty] = useState(false);

  const apps = settings.apps;
  const has = (exe: string) => apps.some((a) => a.toLowerCase() === exe.toLowerCase());

  const load = async () => {
    setLoading(true);
    setProcs(await window.vmex.system.processes());
    setLoading(false);
  };
  useEffect(() => {
    void load();
  }, []);

  const save = async (next: string[]) => {
    await setSettings({ apps: next });
    if (status.state === "connected" && settings.mode === "apps") setDirty(true);
  };
  const add = (exe: string) => !has(exe) && void save([...apps, exe]);
  const remove = (exe: string) => void save(apps.filter((a) => a.toLowerCase() !== exe.toLowerCase()));

  const browse = async () => {
    const exe = await window.vmex.system.pickExe();
    if (exe) add(exe);
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return procs.filter((p) => !has(p.name) && (!q || p.name.toLowerCase().includes(q)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [procs, query, apps]);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h2>Apps</h2>
          <p>In <b>Apps only</b> mode, just these programs go through VMEX. Great for games: everything else keeps your normal connection.</p>
        </div>
        <div className="row">
          {settings.mode !== "apps" ? (
            <button type="button" className="btn btn--primary" onClick={() => void setSettings({ mode: "apps" }).then(() => toast("Apps only mode selected", "good"))}>
              <Icon name="target" size={16} /> Use Apps only mode
            </button>
          ) : (
            <span className="badge badge--good">Apps only mode is on</span>
          )}
        </div>
      </div>

      <AnimatePresence>
        {dirty && (
          <motion.div className="notice notice--info" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <Icon name="refresh" size={16} />
            <span>Your app list changed. Reconnect to apply it.</span>
            <button type="button" className="btn btn--small" onClick={() => { setDirty(false); void connect(); }}>Reconnect</button>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="apps-grid">
        <section className="panel">
          <div className="panel-head">
            <h3>Using VMEX <em className="count">{apps.length}</em></h3>
            <button type="button" className="btn btn--ghost btn--small" onClick={() => void browse()}>
              <Icon name="folder" size={14} /> Browse .exe
            </button>
          </div>
          {apps.length === 0 ? (
            <p className="muted pad">No apps yet. Add a running app or pick one below.</p>
          ) : (
            <ul className="chips-list">
              <AnimatePresence initial={false}>
                {apps.map((a) => (
                  <motion.li key={a} layout initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} className="app-chip">
                    <Icon name="gamepad" size={15} />
                    <span>{a}</span>
                    <button type="button" onClick={() => remove(a)} aria-label={`Remove ${a}`}><Icon name="x" size={13} /></button>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          )}

          <div className="panel-head panel-head--sub">
            <h4>Popular</h4>
          </div>
          <div className="popular">
            {POPULAR.map((p) => (
              <button key={p.exe} type="button" className={`pop${has(p.exe) ? " is-on" : ""}`} onClick={() => (has(p.exe) ? remove(p.exe) : add(p.exe))}>
                {has(p.exe) ? <Icon name="check" size={14} /> : <Icon name="plus" size={14} />}
                {p.name}
              </button>
            ))}
          </div>
        </section>

        <section className="panel">
          <div className="panel-head">
            <h3>Running now</h3>
            <button type="button" className="icon-btn" onClick={() => void load()} title="Refresh"><Icon name="refresh" size={15} /></button>
          </div>
          <label className="search search--full">
            <Icon name="search" size={15} />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search running apps" />
          </label>
          <ul className="proc-list">
            {loading && <li className="muted pad">Loading...</li>}
            {!loading && filtered.length === 0 && <li className="muted pad">Nothing to show.</li>}
            {filtered.slice(0, 200).map((p) => (
              <li key={p.name}>
                <span className="proc-name">{p.name}</span>
                {p.count > 1 && <small>{p.count}</small>}
                <button type="button" className="btn btn--ghost btn--small" onClick={() => add(p.name)}>
                  <Icon name="plus" size={13} /> Add
                </button>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
