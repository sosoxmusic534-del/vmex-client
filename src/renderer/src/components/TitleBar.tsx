import Icon from "./Icon";

export default function TitleBar() {
  const api = window.vmex.app;
  return (
    <header className="titlebar">
      <div className="titlebar-brand">
        <img src="./logo.png" alt="" onError={(e) => (e.currentTarget.style.display = "none")} />
        <span>VMEX</span>
      </div>
      <div className="titlebar-drag" />
      <div className="titlebar-controls">
        <button type="button" onClick={api.minimize} aria-label="Minimize"><Icon name="minimize" size={14} /></button>
        <button type="button" onClick={api.maximize} aria-label="Maximize"><Icon name="maximize" size={12} /></button>
        <button type="button" className="is-close" onClick={api.close} aria-label="Close"><Icon name="x" size={14} /></button>
      </div>
    </header>
  );
}
