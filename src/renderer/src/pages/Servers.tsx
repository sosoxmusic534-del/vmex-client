import { AnimatePresence, motion } from "framer-motion";
import { useMemo, useState } from "react";
import type { Server } from "../../../shared/types";
import Icon from "../components/Icon";
import ImportModal from "../components/ImportModal";
import Modal from "../components/Modal";
import { ago, errText, pingTone, protoLabel } from "../lib/format";
import { useApp } from "../lib/store";

type Filter = "all" | "manual" | "subs" | "vmex";

export default function Servers() {
  const servers = useApp((s) => s.servers);
  const subs = useApp((s) => s.subs);
  const selectedId = useApp((s) => s.settings?.selectedId);
  const status = useApp((s) => s.status);
  const { select, toast, refreshSubs } = useApp.getState();
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [renaming, setRenaming] = useState<Server | null>(null);
  const [newName, setNewName] = useState("");
  const [testing, setTesting] = useState(false);
  const [updating, setUpdating] = useState(false);

  const subName = (id: string) => subs.find((s) => s.id === id)?.name ?? "Subscription";

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return servers.filter((s) => {
      if (filter === "manual" && s.source !== "manual") return false;
      if (filter === "vmex" && s.source !== "vmex") return false;
      if (filter === "subs" && !s.source.startsWith("sub-")) return false;
      return !q || `${s.name} ${s.address} ${s.protocol}`.toLowerCase().includes(q);
    });
  }, [servers, filter, query]);

  const testAll = async () => {
    setTesting(true);
    try {
      await window.vmex.servers.ping(list.map((s) => s.id));
    } catch (e) {
      toast(errText(e), "bad");
    } finally {
      setTesting(false);
    }
  };

  const updateSubs = async () => {
    setUpdating(true);
    try {
      const result = await window.vmex.subs.refresh();
      await refreshSubs();
      const failed = result.filter((s) => s.error);
      toast(failed.length ? `${failed.length} subscription(s) failed to update` : "Subscriptions updated", failed.length ? "bad" : "good");
    } finally {
      setUpdating(false);
    }
  };

  const remove = async (s: Server) => {
    if (!confirm(`Remove "${s.name}"?`)) return;
    await window.vmex.servers.remove([s.id]);
  };

  const copy = (s: Server) =>
    navigator.clipboard.writeText(s.link).then(() => toast("Link copied", "good")).catch(() => toast("Couldn't copy", "bad"));

  const saveName = async () => {
    if (renaming) await window.vmex.servers.rename(renaming.id, newName);
    setRenaming(null);
  };

  const counts = {
    all: servers.length,
    manual: servers.filter((s) => s.source === "manual").length,
    subs: servers.filter((s) => s.source.startsWith("sub-")).length,
    vmex: servers.filter((s) => s.source === "vmex").length,
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h2>Servers</h2>
          <p>Import any V2Ray link, add a subscription, or sign in to load your VMEX plans.</p>
        </div>
        <div className="row">
          <button type="button" className="btn btn--ghost" onClick={() => void testAll()} disabled={testing || !list.length}>
            <Icon name="bolt" size={15} /> {testing ? "Testing..." : "Test all"}
          </button>
          <button type="button" className="btn btn--primary" onClick={() => setImportOpen(true)}>
            <Icon name="plus" size={16} /> Add servers
          </button>
        </div>
      </div>

      <div className="toolbar">
        <div className="seg">
          {(["all", "manual", "subs", "vmex"] as Filter[]).map((f) => (
            <button key={f} type="button" className={filter === f ? "is-active" : ""} onClick={() => setFilter(f)}>
              {f === "all" ? "All" : f === "manual" ? "Imported" : f === "subs" ? "Subscriptions" : "VMEX"}
              <em>{counts[f]}</em>
            </button>
          ))}
        </div>
        <label className="search">
          <Icon name="search" size={15} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search servers" />
        </label>
      </div>

      {list.length === 0 ? (
        <div className="empty">
          <div className="empty-icon"><Icon name="servers" size={28} /></div>
          <h3>{servers.length ? "No servers match" : "No servers yet"}</h3>
          <p>{servers.length ? "Try another filter or search." : "Paste a V2Ray link or add a subscription. No account needed."}</p>
          {!servers.length && (
            <button type="button" className="btn btn--primary" onClick={() => setImportOpen(true)}>
              <Icon name="plus" size={16} /> Add servers
            </button>
          )}
        </div>
      ) : (
        <motion.ul className="server-list" layout>
          <AnimatePresence initial={false}>
            {list.map((s, i) => {
              const active = s.id === selectedId;
              const live = active && status.state === "connected";
              return (
                <motion.li
                  key={s.id}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0, transition: { delay: Math.min(i, 12) * 0.025 } }}
                  exit={{ opacity: 0, x: -20 }}
                  className={`server${active ? " is-active" : ""}${live ? " is-live" : ""}`}
                  onClick={() => void select(s.id)}
                >
                  <span className="server-radio">{active && <motion.span layoutId="server-dot" className="server-radio-dot" />}</span>
                  <span className={`proto proto--${s.protocol}`}>{protoLabel[s.protocol]}</span>
                  <div className="server-main">
                    <b>{s.name}</b>
                    <small>
                      {s.transport} · {s.address}:{s.port}
                      {s.source === "vmex" ? " · VMEX" : s.source.startsWith("sub-") ? ` · ${subName(s.source)}` : ""}
                    </small>
                  </div>
                  <span className={`ping ping--${pingTone(s.ping)}`} title={s.pingAt ? `Tested ${ago(s.pingAt)}` : "Not tested"}>
                    {s.ping === undefined ? "--" : s.ping === null ? "Timeout" : `${s.ping} ms`}
                  </span>
                  <div className="server-actions" onClick={(e) => e.stopPropagation()}>
                    <button type="button" className="icon-btn" title="Rename" onClick={() => { setRenaming(s); setNewName(s.name); }}>
                      <Icon name="edit" size={15} />
                    </button>
                    <button type="button" className="icon-btn" title="Copy link" onClick={() => copy(s)}>
                      <Icon name="copy" size={15} />
                    </button>
                    {s.source === "manual" && (
                      <button type="button" className="icon-btn icon-btn--danger" title="Remove" onClick={() => void remove(s)}>
                        <Icon name="trash" size={15} />
                      </button>
                    )}
                  </div>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </motion.ul>
      )}

      {subs.length > 0 && (
        <section className="panel subs">
          <div className="panel-head">
            <h3>Subscriptions</h3>
            <button type="button" className="btn btn--ghost btn--small" onClick={() => void updateSubs()} disabled={updating}>
              <Icon name="refresh" size={14} /> {updating ? "Updating..." : "Update all"}
            </button>
          </div>
          {subs.map((sub) => (
            <div key={sub.id} className="sub">
              <Icon name="link" size={16} />
              <div>
                <b>{sub.name}</b>
                <small className={sub.error ? "text-bad" : ""}>
                  {sub.error ? sub.error : `${sub.count ?? 0} servers · updated ${ago(sub.updatedAt)}`}
                </small>
              </div>
              <button
                type="button"
                className="icon-btn icon-btn--danger"
                title="Remove subscription"
                onClick={async () => {
                  if (!confirm(`Remove "${sub.name}" and its servers?`)) return;
                  await window.vmex.subs.remove(sub.id);
                  await refreshSubs();
                }}
              >
                <Icon name="trash" size={15} />
              </button>
            </div>
          ))}
        </section>
      )}

      <ImportModal open={importOpen} onClose={() => setImportOpen(false)} />
      <Modal open={!!renaming} onClose={() => setRenaming(null)} title="Rename server" width={420}>
        <div className="form">
          <label className="field">
            <span>Name</span>
            <input value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void saveName()} autoFocus />
          </label>
          <div className="row-end">
            <button type="button" className="btn btn--primary" onClick={() => void saveName()}>Save</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
