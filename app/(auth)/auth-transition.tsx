"use client";

import { motion } from "framer-motion";
import type { ReactNode } from "react";

export function AuthTransition({ children }: { children: ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
      className="w-full max-w-md"
    >
      {children}
    </motion.div>
  );
}
