"use client"

import { motion } from "framer-motion"
import { ArrowUpRight } from "lucide-react"

const EJEMPLOS = [
  "Quiero abrir un foodtruck, ¿qué necesito?",
  "¿Cómo saco la licencia de conducir por primera vez?",
  "Soy jubilado, ¿puedo no pagar el impuesto inmobiliario?",
  "¿Dónde tramito el certificado de discapacidad?",
  "¿Qué necesito para la oblea de estacionamiento?",
  "¿Cómo habilito un local comercial?",
]

export function ExampleCards({ onPick }: { onPick: (pregunta: string) => void }) {
  return (
    <div className="mx-auto w-full max-w-2xl">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="mb-8 text-center"
      >
        <h2 className="text-balance text-3xl leading-tight text-foreground sm:text-4xl">
          Hola, soy Ventanilla.
        </h2>
        <p className="mx-auto mt-3 max-w-md text-pretty text-muted-foreground">
          Te ayudo con tus trámites de Salta. Preguntame lo que necesites: te respondo con
          información oficial y te muestro siempre la fuente.
        </p>
      </motion.div>

      <div className="grid gap-3 sm:grid-cols-2">
        {EJEMPLOS.map((ejemplo, i) => (
          <motion.button
            key={ejemplo}
            type="button"
            onClick={() => onPick(ejemplo)}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 + i * 0.06, duration: 0.35, ease: "easeOut" }}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.99 }}
            className="group flex items-start gap-3 rounded-2xl border border-border bg-card px-4 py-4 text-left shadow-sm transition-colors hover:border-primary/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <span className="flex-1 text-pretty leading-snug text-foreground">{ejemplo}</span>
            <ArrowUpRight
              className="size-5 shrink-0 text-muted-foreground transition-colors group-hover:text-primary"
              aria-hidden="true"
            />
          </motion.button>
        ))}
      </div>
    </div>
  )
}
