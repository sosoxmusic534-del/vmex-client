import { AnimatePresence, motion } from "framer-motion";
import { useEffect } from "react";
import Sidebar from "./components/Sidebar";
import TitleBar from "./components/TitleBar";
import Toasts from "./components/Toasts";
import { useApp } from "./lib/store";
import Account from "./pages/Account";
import Apps from "./pages/Apps";
import Home from "./pages/Home";
import Logs from "./pages/Logs";
import Servers from "./pages/Servers";
import Settings from "./pages/Settings";

const PAGES = { home: Home, servers: Servers, apps: Apps, account: Account, logs: Logs, settings: Settings };

export default function App() {
  const ready = useApp((s) => s.ready);
  const page = useApp((s) => s.page);
  const state = useApp((s) => s.status.state);

  useEffect(() => {
    void useApp.getState().init();
  }, []);

  const Page = PAGES[page];

  return (
    <div className={`shell shell--${state}`}>
      <div className="backdrop" aria-hidden="true">
        <span className="blob blob--a" />
        <span className="blob blob--b" />
        <span className="grid" />
      </div>
      <TitleBar />
      <div className="body">
        <Sidebar />
        <main className="content">
          {ready ? (
            <AnimatePresence mode="wait">
              <motion.div
                key={page}
                className="page-wrap"
                initial={{ opacity: 0, y: 14, filter: "blur(4px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                exit={{ opacity: 0, y: -10, filter: "blur(4px)" }}
                transition={{ duration: 0.28, ease: [0.2, 0.8, 0.2, 1] }}
              >
                <Page />
              </motion.div>
            </AnimatePresence>
          ) : (
            <div className="boot">
              <span className="boot-spinner" />
            </div>
          )}
        </main>
      </div>
      <Toasts />
    </div>
  );
}
