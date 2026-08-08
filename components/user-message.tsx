"use client"

import { motion } from "framer-motion"

export function UserMessage({ texto }: { texto: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="flex justify-end"
    >
      <div className="max-w-[85%] rounded-2xl rounded-br-md bg-primary px-5 py-3 text-primary-foreground">
        <p className="text-pretty leading-relaxed">{texto}</p>
      </div>
    </motion.div>
  )
}
