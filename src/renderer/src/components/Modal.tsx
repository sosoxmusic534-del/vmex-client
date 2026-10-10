import { AnimatePresence, motion } from "framer-motion";
import type { ReactNode } from "react";
import Icon from "./Icon";

export default function Modal({ open, title, onClose, children, width = 520 }: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  width?: number;
}) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="modal" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={onClose}>
          <motion.div
            className="modal-box"
            style={{ width }}
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 380, damping: 30 }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="modal-head">
              <h3>{title}</h3>
              <button type="button" className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="x" size={16} /></button>
            </div>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
