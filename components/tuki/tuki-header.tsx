'use client'

import Image from 'next/image'
import { useEffect, useState } from 'react'
import { useTheme } from 'next-themes'
import { Moon, Plus, Sun, User } from 'lucide-react'

/**
 * Header sticky del rediseño: avatar de Tuki + wordmark a la izquierda,
 * toggle de tema / "Nuevo chat" / perfil a la derecha.
 */
export function TukiHeader({ onNewChat }: { onNewChat: () => void }) {
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  const isDark = resolvedTheme !== 'light'
  const themeLabel = isDark ? 'Activar modo claro' : 'Activar modo oscuro'

  return (
    <header className="bg-tuki-bg/90 no-print sticky top-0 z-20 flex flex-wrap items-center justify-between gap-4 py-3.5 backdrop-blur-md">
      <div className="flex items-center gap-3">
        <div className="bg-tuki-stage border-tuki-line-strong relative size-[46px] shrink-0 overflow-hidden rounded-full border">
          <Image
            src="/tuki/mascot.png"
            alt=""
            width={92}
            height={92}
            priority
            className="size-full scale-150 object-cover object-[50%_20%]"
          />
        </div>
        <span className="text-tuki-fg text-[30px] font-extrabold tracking-[-0.02em]">Tuki</span>
      </div>

      <div className="flex items-center gap-3">
        {/* Toggle de tema */}
        <button
          type="button"
          onClick={() => setTheme(isDark ? 'light' : 'dark')}
          aria-label={themeLabel}
          title={themeLabel}
          className="bg-tuki-panel2 border-tuki-line text-tuki-fg hover:border-tuki-line-strong hover:bg-tuki-panel flex size-[46px] items-center justify-center rounded-full border transition-colors"
        >
          {/* Placeholder neutro hasta montar, para evitar mismatch de hidratación */}
          {mounted ? (
            isDark ? (
              <Sun className="size-5" strokeWidth={1.8} aria-hidden />
            ) : (
              <Moon className="size-5" strokeWidth={1.8} aria-hidden />
            )
          ) : (
            <span className="size-5" aria-hidden />
          )}
        </button>

        {/* CTA principal: tinta oscura sobre naranja (AA) */}
        <button
          type="button"
          onClick={onNewChat}
          className="text-tuki-ink flex h-[46px] items-center gap-2.5 whitespace-nowrap rounded-full border border-white/20 bg-[linear-gradient(180deg,#FF9440,#F0760F)] px-[22px] text-base font-extrabold shadow-[0_8px_22px_#F5811F45] transition hover:-translate-y-px hover:brightness-105 active:translate-y-0"
        >
          <Plus className="size-5" strokeWidth={2.4} aria-hidden />
          Nuevo chat
        </button>

        <button
          type="button"
          aria-label="Mi perfil"
          className="bg-tuki-panel2 border-tuki-line text-tuki-fg hover:border-tuki-line-strong hover:bg-tuki-panel flex size-[46px] items-center justify-center rounded-full border transition-colors"
        >
          <User className="size-5" strokeWidth={1.8} aria-hidden />
        </button>
      </div>
    </header>
  )
}
