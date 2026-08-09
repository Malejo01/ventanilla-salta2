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
      <div className="text-tuki-ink max-w-[80%] rounded-[20px] rounded-br-[6px] bg-[linear-gradient(180deg,#FF9440,#F0760F)] px-5 py-3">
        <p className="text-pretty text-base font-bold leading-relaxed">{texto}</p>
      </div>
    </motion.div>
  )
}
