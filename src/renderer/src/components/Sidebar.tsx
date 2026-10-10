import { motion } from "framer-motion";
import { useApp, type Page } from "../lib/store";
import Icon, { type IconName } from "./Icon";

const NAV: { page: Page; label: string; icon: IconName }[] = [
  { page: "home", label: "Connect", icon: "home" },
  { page: "servers", label: "Servers", icon: "servers" },
  { page: "apps", label: "Apps", icon: "gamepad" },
  { page: "account", label: "Account", icon: "user" },
  { page: "logs", label: "Logs", icon: "logs" },
  { page: "settings", label: "Settings", icon: "settings" },
];

export default function Sidebar() {
  const page = useApp((s) => s.page);
  const go = useApp((s) => s.go);
  const status = useApp((s) => s.status);
  const account = useApp((s) => s.account);
  const connected = status.state === "connected";

  return (
    <aside className="sidebar">
      <nav className="nav">
        {NAV.map((n) => (
          <button key={n.page} type="button" className={`nav-item${page === n.page ? " is-active" : ""}`} onClick={() => go(n.page)}>
            {page === n.page && (
              <motion.span layoutId="nav-pill" className="nav-pill" transition={{ type: "spring", stiffness: 420, damping: 34 }} />
            )}
            <Icon name={n.icon} size={18} />
            <span>{n.label}</span>
          </button>
        ))}
      </nav>

      <div className="side-status">
        <span className={`side-dot side-dot--${status.state}`} />
        <div>
          <b>{connected ? "Protected" : status.state === "connecting" ? "Connecting" : "Not protected"}</b>
          <small>{account.loggedIn ? account.name : "Guest mode"}</small>
        </div>
      </div>
    </aside>
  );
}
