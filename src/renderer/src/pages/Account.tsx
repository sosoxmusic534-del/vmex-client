import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import Icon from "../components/Icon";
import { ago, bytes, errText } from "../lib/format";
import { useApp } from "../lib/store";

export default function Account() {
  const account = useApp((s) => s.account);
  const info = useApp((s) => s.info);
  const { setAccount, toast } = useApp.getState();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [challenge, setChallenge] = useState<{ id: string; email: string } | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const site = info?.site ?? "";

  const done = async () => {
    setAccount(await window.vmex.account.get());
    setChallenge(null);
    setCode("");
    setPassword("");
    toast("Signed in. Your VMEX configs were added to Servers.", "good");
  };

  const login = async () => {
    setBusy(true);
    setError("");
    const r = await window.vmex.account.login(email.trim(), password);
    setBusy(false);
    if (r.otpRequired && r.challengeId) setChallenge({ id: r.challengeId, email: r.email ?? email });
    else if (r.ok) await done();
    else setError(r.error ?? "Couldn't sign in.");
  };

  const verify = async () => {
    if (!challenge) return;
    setBusy(true);
    setError("");
    const r = await window.vmex.account.verify(challenge.id, code.replace(/\D/g, ""));
    setBusy(false);
    if (r.ok) await done();
    else setError(r.error ?? "Wrong code.");
  };

  const sync = async () => {
    setBusy(true);
    try {
      setAccount(await window.vmex.account.sync());
      toast("Plans and configs updated", "good");
    } catch (e) {
      toast(errText(e), "bad");
    } finally {
      setBusy(false);
    }
  };

  const logout = async () => {
    setAccount(await window.vmex.account.logout());
    toast("Signed out. VMEX configs were removed from Servers.");
  };

  if (account.loggedIn) {
    return (
      <div className="page">
        <div className="page-head">
          <div>
            <h2>Account</h2>
            <p>Your VMEX plans are added to Servers automatically and stay up to date.</p>
          </div>
          <div className="row">
            <button type="button" className="btn btn--ghost" onClick={() => void sync()} disabled={busy}>
              <Icon name="refresh" size={15} /> {busy ? "Syncing..." : "Sync now"}
            </button>
            <button type="button" className="btn btn--danger" onClick={() => void logout()}>
              <Icon name="logout" size={15} /> Sign out
            </button>
          </div>
        </div>

        <section className="panel profile">
          <div className="avatar">{(account.name ?? "V").slice(0, 1).toUpperCase()}</div>
          <div>
            <b>{account.name}</b>
            <small>{account.email} · synced {ago(account.syncedAt)}</small>
          </div>
          <button type="button" className="btn btn--ghost btn--small" onClick={() => window.vmex.app.openExternal(`${site}/portal`)}>
            <Icon name="external" size={14} /> Open dashboard
          </button>
        </section>

        <div className="plans">
          {(account.plans ?? []).length === 0 && (
            <div className="empty">
              <div className="empty-icon"><Icon name="bolt" size={26} /></div>
              <h3>No plans yet</h3>
              <p>Buy a plan on the website. It will show up here and in Servers.</p>
              <button type="button" className="btn btn--primary" onClick={() => window.vmex.app.openExternal(`${site}/portal/store`)}>
                Open store
              </button>
            </div>
          )}
          {(account.plans ?? []).map((p, i) => {
            const pct = p.totalBytes ? Math.min(100, (p.usedBytes / p.totalBytes) * 100) : 100;
            const days = p.expiresAt ? Math.max(0, Math.ceil((p.expiresAt - Date.now()) / 86400000)) : null;
            return (
              <motion.section key={p.id} className="panel plan" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0, transition: { delay: i * 0.05 } }}>
                <div className="plan-top">
                  <div>
                    <b>{p.planName ?? p.name}</b>
                    <small>{p.name}</small>
                  </div>
                  <span className={`badge badge--cap ${p.status === "active" ? "badge--good" : "badge--bad"}`}>{p.status}</span>
                </div>
                <div className="bar">
                  <motion.span initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.9, ease: "easeOut" }} className={p.totalBytes > 0 && pct > 90 ? "is-hot" : ""} />
                </div>
                <div className="plan-meta">
                  <span>{bytes(p.usedBytes)} used{p.totalBytes ? ` of ${bytes(p.totalBytes)}` : " · unlimited"}</span>
                  {days !== null && <span>{days} days left</span>}
                </div>
              </motion.section>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h2>Account</h2>
          <p>Signing in is optional. VMEX works with any V2Ray link without an account.</p>
        </div>
      </div>

      <div className="account-grid">
        <section className="panel perks">
          <h3>Why sign in?</h3>
          {[
            ["bolt", "Your VMEX configs appear in Servers automatically"],
            ["refresh", "Renewed or new plans sync by themselves"],
            ["signal", "See data used and days left for every plan"],
            ["shield", "Your password is never stored, only a secure session"],
          ].map(([icon, text]) => (
            <div key={text} className="perk">
              <span className="perk-icon"><Icon name={icon as "bolt"} size={16} /></span>
              <span>{text}</span>
            </div>
          ))}
          <button type="button" className="btn btn--ghost" onClick={() => window.vmex.app.openExternal(`${site}/portal/register`)}>
            Create a free account <Icon name="external" size={14} />
          </button>
        </section>

        <section className="panel login">
          <AnimatePresence mode="wait">
            {challenge ? (
              <motion.div key="otp" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="form">
                <h3>Check your email</h3>
                <p className="muted">We sent a 6-digit code to {challenge.email}.</p>
                <input
                  className="otp"
                  inputMode="numeric"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  onKeyDown={(e) => e.key === "Enter" && void verify()}
                  placeholder="000000"
                  autoFocus
                />
                {error && <p className="text-bad">{error}</p>}
                <button type="button" className="btn btn--primary btn--block" onClick={() => void verify()} disabled={busy || code.length !== 6}>
                  {busy ? "Checking..." : "Verify"}
                </button>
                <div className="row-between">
                  <button type="button" className="link" onClick={() => setChallenge(null)}>Back</button>
                  <button
                    type="button"
                    className="link"
                    onClick={async () => {
                      const r = await window.vmex.account.resend(challenge.id);
                      toast(r.ok ? "New code sent" : r.error ?? "Couldn't resend", r.ok ? "good" : "bad");
                    }}
                  >
                    Resend code
                  </button>
                </div>
              </motion.div>
            ) : (
              <motion.div key="login" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} className="form">
                <h3>Sign in to VMEX</h3>
                <label className="field">
                  <span>Email</span>
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
                </label>
                <label className="field">
                  <span>Password</span>
                  <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void login()} />
                </label>
                {error && <p className="text-bad">{error}</p>}
                <button type="button" className="btn btn--primary btn--block" onClick={() => void login()} disabled={busy || !email || !password}>
                  {busy ? "Signing in..." : "Sign in"}
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </section>
      </div>
    </div>
  );
}
