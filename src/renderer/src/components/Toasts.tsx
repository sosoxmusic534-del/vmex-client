import { AnimatePresence, motion } from "framer-motion";
import { useApp } from "../lib/store";
import Icon from "./Icon";

export default function Toasts() {
  const toasts = useApp((s) => s.toasts);
  const dismiss = useApp((s) => s.dismiss);
  return (
    <div className="toasts">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            layout
            className={`toast toast--${t.tone}`}
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 40 }}
            onClick={() => dismiss(t.id)}
          >
            <Icon name={t.tone === "bad" ? "info" : t.tone === "good" ? "check" : "info"} size={16} />
            <span>{t.text}</span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
