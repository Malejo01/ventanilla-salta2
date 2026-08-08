"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { ArrowUpRight, Building2, Car, Receipt, HeartHandshake } from "lucide-react"

type Category = "Todas" | "Comercial" | "Vehicular" | "Impuestos" | "Discapacidad"

const CATEGORIES: { name: Category; icon: React.ElementType }[] = [
  { name: "Todas", icon: HeartHandshake }, // Usamos un icono genérico o lo omitimos si es Todas
  { name: "Comercial", icon: Building2 },
  { name: "Vehicular", icon: Car },
  { name: "Impuestos", icon: Receipt },
  { name: "Discapacidad", icon: HeartHandshake },
]

const EJEMPLOS = [
  { text: "Quiero abrir un foodtruck, ¿qué necesito?", cat: "Comercial" },
  { text: "¿Cómo saco la licencia de conducir por primera vez?", cat: "Vehicular" },
  { text: "Soy jubilado, ¿puedo no pagar el impuesto inmobiliario?", cat: "Impuestos" },
  { text: "¿Dónde tramito el certificado de discapacidad?", cat: "Discapacidad" },
  { text: "¿Qué necesito para la oblea de estacionamiento?", cat: "Vehicular" },
  { text: "¿Cómo habilito un local comercial?", cat: "Comercial" },
]

export function ExampleCards({ onPick }: { onPick: (pregunta: string) => void }) {
  const [activeCategory, setActiveCategory] = useState<Category>("Todas")

  const filteredExamples = EJEMPLOS.filter(
    (ex) => activeCategory === "Todas" || ex.cat === activeCategory
  )

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
          Te ayudo con tus trámites de Salta. Elegí una categoría o escribí tu consulta:
        </p>
      </motion.div>

      {/* Categorías (Filtros) */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.4 }}
        className="mb-6 flex flex-wrap justify-center gap-2"
      >
        {CATEGORIES.map((cat) => {
          const Icon = cat.icon
          const isActive = activeCategory === cat.name
          return (
            <button
              key={cat.name}
              onClick={() => setActiveCategory(cat.name)}
              className={`flex items-center gap-1.5 rounded-full border px-4 py-1.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
                isActive
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground hover:bg-secondary hover:text-foreground"
              }`}
            >
              {cat.name !== "Todas" && <Icon className="size-4" />}
              {cat.name}
            </button>
          )
        })}
      </motion.div>

      {/* Sugerencias (Chips) */}
      <div className="flex flex-wrap justify-center gap-2.5">
        <AnimatePresence mode="popLayout">
          {filteredExamples.map((ejemplo, i) => (
            <motion.button
              key={ejemplo.text}
              layout
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.2 }}
              onClick={() => onPick(ejemplo.text)}
              className="group flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm text-foreground shadow-sm transition-colors hover:border-primary/40 hover:bg-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <span className="text-pretty">{ejemplo.text}</span>
              <ArrowUpRight
                className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary"
                aria-hidden="true"
              />
            </motion.button>
          ))}
        </AnimatePresence>
      </div>
    </div>
  )
}
