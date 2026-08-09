'use client'

import Image from 'next/image'
import { motion, useReducedMotion } from 'framer-motion'

/**
 * Hero: mascota con disco de glow + saludo "Hola, soy Tuki".
 *
 * La flotación de la mascota es Framer Motion (translateY, no scale: en una
 * figura con forma el scale se lee como "respirar raro"). El glow sigue en CSS
 * (.tuki-glow), que se apaga solo con prefers-reduced-motion; la flotación la
 * apagamos a mano con useReducedMotion.
 *
 * `pensando` = hay una consulta en vuelo. La mascota sigue en pantalla mientras
 * se espera la respuesta, así que ahí flota más amplio y más rápido para que se
 * lea como actividad y no como reposo.
 */
export function TukiHero({ pensando = false }: { pensando?: boolean }) {
  const reduceMotion = useReducedMotion()

  return (
    <motion.section
      initial={reduceMotion ? false : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: 'easeOut' }}
      className="flex flex-wrap items-center gap-2 sm:gap-5 lg:gap-7"
    >
      <div className="relative w-[clamp(200px,26vw,340px)] shrink-0">
        <div
          className="tuki-glow absolute inset-x-[4%] bottom-[2%] top-[6%] rounded-full"
          style={{
            background:
              'radial-gradient(circle at 50% 55%, #1D2E5C 0%, #101A38 48%, transparent 74%)',
          }}
          aria-hidden
        />
        <motion.div
          className="relative"
          animate={reduceMotion ? { y: 0 } : { y: pensando ? [0, -10, 0] : [0, -6, 0] }}
          transition={
            reduceMotion
              ? { duration: 0 }
              : { duration: pensando ? 1.5 : 3, repeat: Infinity, ease: 'easeInOut' }
          }
        >
          <Image
            src="/tuki/mascot.png"
            alt="Tuki, el asistente virtual, saludando con la mano"
            width={839}
            height={1040}
            priority
            className="block w-full"
          />
        </motion.div>
      </div>

      <div className="min-w-[min(100%,280px)] flex-1 basis-[300px] pb-2">
        <h1 className="text-tuki-fg text-pretty text-[clamp(40px,6.2vw,82px)] font-extrabold leading-[0.98] tracking-[-0.03em]">
          Hola, soy{' '}
          <span className="text-tuki-accent-text inline-flex items-start">
            Tuki
            <span className="text-tuki-accent ml-[0.06em] text-[0.3em]" aria-hidden>
              ✦
            </span>
          </span>
        </h1>
        <p className="text-tuki-muted mt-4 max-w-[22ch] text-pretty text-[clamp(18px,1.7vw,26px)] leading-[1.35]">
          Tu amigo virtual
        </p>
      </div>
    </motion.section>
  )
}
