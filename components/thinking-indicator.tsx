"use client"

import { motion } from "framer-motion"

export function ThinkingIndicator() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="flex items-center gap-3 rounded-2xl border border-border bg-card px-5 py-4"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-1.5" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="size-2.5 rounded-full bg-primary"
            animate={{ opacity: [0.3, 1, 0.3], y: [0, -4, 0] }}
            transition={{
              duration: 1.1,
              repeat: Number.POSITIVE_INFINITY,
              delay: i * 0.18,
              ease: "easeInOut",
            }}
          />
        ))}
      </div>
      <span className="text-sm text-muted-foreground">Buscando en fuentes oficiales…</span>
    </motion.div>
  )
}
