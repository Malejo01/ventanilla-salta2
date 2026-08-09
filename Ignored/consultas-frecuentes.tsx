'use client'

import { motion, useReducedMotion } from 'framer-motion'
import { Accessibility, ChevronRight, Contact, Truck, Users } from 'lucide-react'

type Consulta = {
  pregunta: string
  /** Texto multilínea tal como se muestra en la tarjeta */
  linea1: string
  linea2: string
  icon: React.ElementType
  gradient: string
  /** Casi-blanco elegido para superar 4.5:1 contra el extremo más claro del gradiente */
  color: string
}

const CONSULTAS: Consulta[] = [
  {
    pregunta: 'Quiero abrir un foodtruck, ¿qué necesito?',
    linea1: 'Quiero abrir un foodtruck,',
    linea2: '¿qué necesito?',
    icon: Truck,
    gradient: 'linear-gradient(115deg,#8A4A1E,#7B3D52)',
    color: '#FFF3EA',
  },
  {
    pregunta: '¿Cómo saco la licencia de conducir por primera vez?',
    linea1: '¿Cómo saco la licencia',
    linea2: 'de conducir por primera vez?',
    icon: Contact,
    gradient: 'linear-gradient(115deg,#4B3B85,#2E4A8C)',
    color: '#EEF1FF',
  },
  {
    pregunta: 'Soy jubilado, ¿puedo no pagar el impuesto inmobiliario?',
    linea1: 'Soy jubilado, ¿puedo no pagar',
    linea2: 'el impuesto inmobiliario?',
    icon: Users,
    gradient: 'linear-gradient(115deg,#25604F,#1E5E73)',
    color: '#E9FBF5',
  },
  {
    pregunta: '¿Dónde tramito el certificado de discapacidad?',
    linea1: '¿Dónde tramito el certificado',
    linea2: 'de discapacidad?',
    icon: Accessibility,
    gradient: 'linear-gradient(115deg,#1F5C86,#274C93)',
    color: '#E8F3FF',
  },
]

export function ConsultasFrecuentes({
  onPick,
  disabled,
}: {
  onPick: (pregunta: string) => void
  disabled?: boolean
}) {
  const reduceMotion = useReducedMotion()

  return (
    <section className="flex flex-col gap-3.5">
      <h2 className="text-tuki-fg flex items-center gap-2.5 text-[19px] font-extrabold">
        <span className="text-tuki-accent" aria-hidden>
          ✦
        </span>
        Consultas frecuentes
      </h2>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,280px),1fr))] gap-3.5">
        {CONSULTAS.map(({ pregunta, linea1, linea2, icon: Icon, gradient, color }) => (
          <motion.button
            key={pregunta}
            type="button"
            onClick={() => onPick(pregunta)}
            disabled={disabled}
            whileHover={reduceMotion || disabled ? undefined : { y: -3 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            aria-label={pregunta}
            style={{ background: gradient, color }}
            className="flex min-h-[92px] items-center gap-3.5 rounded-[22px] border border-white/[0.18] px-[18px] py-4 text-left text-base font-semibold leading-[1.35] transition-shadow hover:shadow-[0_14px_30px_rgba(0,0,0,.35)] disabled:opacity-60"
          >
            <Icon className="size-[30px] shrink-0 opacity-90" strokeWidth={1.6} aria-hidden />
            <span className="flex-1">
              {linea1}
              <br />
              {linea2}
            </span>
            <span
              className="flex size-8 shrink-0 items-center justify-center rounded-full border border-white/20 bg-black/[0.19]"
              aria-hidden
            >
              <ChevronRight className="size-4" strokeWidth={2} />
            </span>
          </motion.button>
        ))}
      </div>
    </section>
  )
}
