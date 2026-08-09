'use client'

import Image from 'next/image'
import { Clock, Globe, ShieldCheck } from 'lucide-react'

const BENEFICIOS = [
  {
    icon: Globe,
    titulo: '100% online',
    detalle: 'Hacé tus trámites desde donde estés.',
  },
  {
    icon: Clock,
    titulo: 'Respuestas al instante',
    detalle: 'Sin esperar en filas ni llamados.',
  },
  {
    icon: ShieldCheck,
    titulo: 'Información oficial',
    detalle: 'Siempre actualizada y confiable.',
  },
]

export function PanelBeneficios() {
  return (
    <aside className="bg-tuki-panel2 border-tuki-line flex flex-col gap-5 rounded-[30px] border p-[clamp(18px,2vw,26px)] backdrop-blur-[10px]">
      <div className="flex items-center gap-3.5">
        <div className="flex size-[52px] shrink-0 items-center justify-center rounded-2xl border border-[#F5811F45] bg-[#F5811F1F]">
          <span className="text-tuki-accent text-2xl leading-none" aria-hidden>
            ✦
          </span>
        </div>
        <h2 className="text-tuki-fg text-[clamp(20px,1.6vw,26px)] font-extrabold leading-tight">
          Trámites más fáciles,
          <br />
          <span className="text-tuki-accent-text">siempre para vos.</span>
        </h2>
      </div>

      <Image
        src="/tuki/clipboard.png"
        alt=""
        width={330}
        height={200}
        className="mx-auto w-full max-w-[320px]"
      />

      <ul className="flex flex-col gap-4">
        {BENEFICIOS.map(({ icon: Icon, titulo, detalle }) => (
          <li key={titulo} className="flex items-start gap-3.5">
            <span className="bg-tuki-panel border-tuki-line text-tuki-accent-text flex size-11 shrink-0 items-center justify-center rounded-[14px] border">
              <Icon className="size-5" strokeWidth={1.8} aria-hidden />
            </span>
            <span>
              <span className="text-tuki-fg block text-[17px] font-extrabold leading-snug">
                {titulo}
              </span>
              <span className="text-tuki-dim block text-[15px] leading-[1.35]">{detalle}</span>
            </span>
          </li>
        ))}
      </ul>
    </aside>
  )
}
