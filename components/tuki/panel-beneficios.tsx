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

      {/* Anticipo de una funcion que todavia no existe. Es un <div> a proposito: no navega,
          no recibe foco y no responde al click. Atenuado para que se lea "todavia no" en vez
          de "esto se rompio". El texto va siempre visible, sin depender de hover, porque en
          tactil no hay hover. */}
      <div className="border-tuki-line flex items-center gap-2.5 self-start rounded-full border px-3.5 py-2 opacity-80">
        <svg viewBox="0 0 24 24" fill="#25D366" className="size-5 shrink-0" aria-hidden>
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z" />
        </svg>
        <span className="text-tuki-fg text-[14px] font-semibold leading-none">
          Próximamente en tu WhatsApp
        </span>
      </div>
    </aside>
  )
}
