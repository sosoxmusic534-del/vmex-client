import { useState } from "react";
import { errText } from "../lib/format";
import { useApp } from "../lib/store";
import Icon from "./Icon";
import Modal from "./Modal";

export default function ImportModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useApp((s) => s.toast);
  const refreshSubs = useApp((s) => s.refreshSubs);
  const [tab, setTab] = useState<"links" | "sub">("links");
  const [text, setText] = useState("");
  const [subName, setSubName] = useState("");
  const [subUrl, setSubUrl] = useState("");
  const [busy, setBusy] = useState(false);

  const paste = async () => {
    try {
      setText(await navigator.clipboard.readText());
    } catch {
      toast("Couldn't read the clipboard. Paste with Ctrl+V instead.", "bad");
    }
  };

  const importLinks = async () => {
    setBusy(true);
    try {
      const r = await window.vmex.servers.import(text);
      if (r.added) {
        toast(`Added ${r.added} server${r.added === 1 ? "" : "s"}${r.skipped ? `, ${r.skipped} already in your list` : ""}`, "good");
        setText("");
        onClose();
      } else if (r.skipped) {
        toast("Those servers are already in your list.");
      } else {
        toast(r.errors[0] ?? "Nothing was imported.", "bad");
      }
    } catch (e) {
      toast(errText(e), "bad");
    } finally {
      setBusy(false);
    }
  };

  const addSub = async () => {
    setBusy(true);
    try {
      const sub = await window.vmex.subs.add(subName, subUrl);
      await refreshSubs();
      if (sub?.error) toast(`Subscription added, but updating failed: ${sub.error}`, "bad");
      else toast(`Subscription added with ${sub?.count ?? 0} servers`, "good");
      setSubName("");
      setSubUrl("");
      onClose();
    } catch (e) {
      toast(errText(e), "bad");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Add servers">
      <div className="seg seg--wide">
        <button type="button" className={tab === "links" ? "is-active" : ""} onClick={() => setTab("links")}>
          <Icon name="paste" size={15} /> Paste links
        </button>
        <button type="button" className={tab === "sub" ? "is-active" : ""} onClick={() => setTab("sub")}>
          <Icon name="link" size={15} /> Subscription
        </button>
      </div>

      {tab === "links" ? (
        <div className="form">
          <label className="field">
            <span>V2Ray links (one per line)</span>
            <textarea
              rows={7}
              placeholder={"vless://...\nvmess://...\ntrojan://...\nss://..."}
              value={text}
              onChange={(e) => setText(e.target.value)}
              spellCheck={false}
            />
          </label>
          <p className="hint">VLESS, VMess, Trojan and Shadowsocks links work, including Reality, WS, gRPC and XHTTP.</p>
          <div className="row-end">
            <button type="button" className="btn btn--ghost" onClick={paste}><Icon name="paste" size={15} /> Paste from clipboard</button>
            <button type="button" className="btn btn--primary" onClick={importLinks} disabled={busy || !text.trim()}>
              {busy ? "Importing..." : "Import"}
            </button>
          </div>
        </div>
      ) : (
        <div className="form">
          <label className="field">
            <span>Name</span>
            <input value={subName} onChange={(e) => setSubName(e.target.value)} placeholder="My provider" />
          </label>
          <label className="field">
            <span>Subscription URL</span>
            <input value={subUrl} onChange={(e) => setSubUrl(e.target.value)} placeholder="https://..." spellCheck={false} />
          </label>
          <p className="hint">Servers from a subscription update automatically every time VMEX starts.</p>
          <div className="row-end">
            <button type="button" className="btn btn--primary" onClick={addSub} disabled={busy || !subUrl.trim()}>
              {busy ? "Downloading..." : "Add subscription"}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
