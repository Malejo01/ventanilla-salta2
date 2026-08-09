"use client"

import { useState, useRef, useEffect } from "react"
import { Menu, Plus, Info, FileText, Settings, X } from "lucide-react"
import { ThemeToggle } from "./theme-toggle"

export function Header({ onNewChat }: { onNewChat: () => void }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // Cerrar menú al hacer clic fuera
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false)
      }
    }
    if (menuOpen) {
      document.addEventListener("mousedown", handleClickOutside)
    }
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [menuOpen])

  return (
    <header className="no-print sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur">
      <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3 sm:px-6">
        {/* Izquierda: Logo y Menú */}
        <div className="flex items-center gap-3">
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              aria-label="Abrir menú principal"
              aria-expanded={menuOpen}
            >
              <Menu className="size-5" />
            </button>

            {menuOpen && (
              <div className="absolute left-0 top-full mt-2 w-56 origin-top-left rounded-2xl border border-border bg-card p-2 shadow-xl shadow-black/10 dark:shadow-black/40">
                <div className="mb-2 flex items-center justify-between px-2 pb-2 pt-1 border-b border-border">
                  <span className="text-sm font-semibold text-foreground">Menú</span>
                  <button onClick={() => setMenuOpen(false)} className="rounded-full p-1 text-muted-foreground hover:bg-secondary hover:text-foreground">
                    <X className="size-4" />
                  </button>
                </div>
                <nav className="flex flex-col gap-1">
                  <button className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-foreground transition-colors hover:bg-secondary/70">
                    <Info className="size-4 text-muted-foreground" />
                    Cómo funciona
                  </button>
                  <button className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-foreground transition-colors hover:bg-secondary/70">
                    <FileText className="size-4 text-muted-foreground" />
                    Trámites populares
                  </button>
                  <button className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-foreground transition-colors hover:bg-secondary/70">
                    <Settings className="size-4 text-muted-foreground" />
                    Sobre el proyecto
                  </button>
                </nav>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <span className="font-serif text-lg leading-none">V</span>
            </div>
            <div className="hidden sm:block">
              <h1 className="text-base font-semibold leading-none text-foreground">Ventanilla</h1>
              <p className="mt-0.5 text-xs text-muted-foreground">Asistente oficial</p>
            </div>
          </div>
        </div>

        {/* Derecha: Acciones */}
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <button
            onClick={onNewChat}
            className="flex h-9 items-center gap-2 rounded-full border border-border bg-background px-3 text-sm font-medium text-foreground transition-colors hover:bg-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            aria-label="recordarme por WhatsApp"
          >
            <Plus className="size-4" />
            <span className="hidden sm:inline">recordarme por WhatsApp</span>
          </button>
        </div>
      </div>
    </header>
  )
}
