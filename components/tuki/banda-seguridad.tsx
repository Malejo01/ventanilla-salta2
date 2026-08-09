'use client'

import { ArrowRight } from 'lucide-react'
import Link from 'next/link'

/**
 * Banda inferior "Seguridad y confianza".
 * El escudo va como SVG inline (no PNG) para que escale nítido en cualquier
 * densidad y tome el color del tema sin necesidad de dos assets.
 */
export function BandaSeguridad({ onMasInformacion }: { onMasInformacion?: () => void }) {
  return (
    <section className="bg-tuki-panel2 border-tuki-line mx-auto mt-[clamp(16px,2vw,26px)] flex w-full max-w-[1560px] flex-wrap items-center gap-[clamp(16px,3vw,34px)] rounded-[30px] border bg-[linear-gradient(100deg,#F5811F14,transparent_55%)] px-[clamp(18px,2.4vw,30px)] py-[clamp(18px,2vw,24px)]">
      <svg
        width="96"
        height="96"
        viewBox="0 0 96 96"
        fill="none"
        className="shrink-0"
        aria-hidden
      >
        <defs>
          <linearGradient id="tukiShield" x1="20" y1="8" x2="76" y2="88" gradientUnits="userSpaceOnUse">
            <stop stopColor="#FFB169" />
            <stop offset="0.5" stopColor="#F5811F" />
            <stop offset="1" stopColor="#C25A0B" />
          </linearGradient>
        </defs>
        <path
          d="M48 8 78 20v24c0 20-12.6 34.6-30 44C30.6 78.6 18 64 18 44V20L48 8Z"
          fill="url(#tukiShield)"
          fillOpacity="0.22"
          stroke="url(#tukiShield)"
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
        <path
          d="M40 46v-6a8 8 0 0 1 16 0v6"
          stroke="url(#tukiShield)"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <rect x="36" y="46" width="24" height="20" rx="5" fill="url(#tukiShield)" />
      </svg>

      <div className="min-w-[min(100%,260px)] flex-1">
        <h2 className="text-tuki-fg text-[clamp(20px,1.6vw,26px)] font-extrabold">
          Seguridad y confianza
        </h2>
        <p className="text-tuki-muted mt-1.5 max-w-[56ch] text-base leading-[1.5]">
          Tu información está protegida. Operamos con los más altos estándares de seguridad y
          privacidad.
        </p>
      </div>

      {onMasInformacion ? (
        <button
          type="button"
          onClick={onMasInformacion}
          className="border-tuki-accent text-tuki-accent-text flex h-[52px] shrink-0 items-center gap-2.5 whitespace-nowrap rounded-full border-[1.5px] px-6 text-base font-extrabold transition-colors hover:bg-[#F5811F1F]"
        >
          Más información
          <ArrowRight className="size-5" strokeWidth={2.2} aria-hidden />
        </button>
      ) : (
        <Link
          href="/terminos-y-condiciones"
          className="border-tuki-accent text-tuki-accent-text flex h-[52px] shrink-0 items-center gap-2.5 whitespace-nowrap rounded-full border-[1.5px] px-6 text-base font-extrabold transition-colors hover:bg-[#F5811F1F]"
        >
          Más información
          <ArrowRight className="size-5" strokeWidth={2.2} aria-hidden />
        </Link>
      )}
    </section>
  )
}
