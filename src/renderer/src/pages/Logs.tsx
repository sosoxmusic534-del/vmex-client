import { useEffect, useMemo, useRef, useState } from "react";
import Icon from "../components/Icon";
import { useApp } from "../lib/store";

const SRC = { core: "Xray", tun: "Tunnel", app: "VMEX" } as const;

export default function Logs() {
  const logs = useApp((s) => s.logs);
  const toast = useApp((s) => s.toast);
  const [filter, setFilter] = useState<"all" | "warn">("all");
  const [follow, setFollow] = useState(true);
  const box = useRef<HTMLDivElement>(null);

  const shown = useMemo(() => (filter === "all" ? logs : logs.filter((l) => l.level !== "info")), [logs, filter]);

  useEffect(() => {
    if (follow && box.current) box.current.scrollTop = box.current.scrollHeight;
  }, [shown, follow]);

  const copy = () => {
    const text = shown.map((l) => `${new Date(l.t).toLocaleTimeString()} [${SRC[l.src]}] ${l.text}`).join("\n");
    navigator.clipboard.writeText(text).then(() => toast("Logs copied", "good"));
  };

  const clear = async () => {
    await window.vmex.logs.clear();
    useApp.setState({ logs: [] });
  };

  return (
    <div className="page page--fill">
      <div className="page-head">
        <div>
          <h2>Logs</h2>
          <p>What the engines are doing. Send this to support if something doesn't work.</p>
        </div>
        <div className="row">
          <div className="seg">
            <button type="button" className={filter === "all" ? "is-active" : ""} onClick={() => setFilter("all")}>All</button>
            <button type="button" className={filter === "warn" ? "is-active" : ""} onClick={() => setFilter("warn")}>Problems</button>
          </div>
          <button type="button" className="btn btn--ghost btn--small" onClick={copy}><Icon name="copy" size={14} /> Copy</button>
          <button type="button" className="btn btn--ghost btn--small" onClick={() => void clear()}><Icon name="trash" size={14} /> Clear</button>
        </div>
      </div>
      <div
        ref={box}
        className="logbox"
        onScroll={(e) => {
          const el = e.currentTarget;
          setFollow(el.scrollHeight - el.scrollTop - el.clientHeight < 40);
        }}
      >
        {shown.length === 0 && <p className="muted">Nothing here yet.</p>}
        {shown.map((l, i) => (
          <div key={`${l.t}-${i}`} className={`logline logline--${l.level}`}>
            <time>{new Date(l.t).toLocaleTimeString()}</time>
            <span className={`logsrc logsrc--${l.src}`}>{SRC[l.src]}</span>
            <span className="logtext">{l.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
