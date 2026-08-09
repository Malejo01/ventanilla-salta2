import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

export default function TerminosYCondicionesPage() {
  return (
    <main className="min-h-dvh bg-[linear-gradient(180deg,#0D1A43_0%,#10255E_100%)] px-5 py-8 text-white sm:px-8 sm:py-12">
      <div className="mx-auto w-full max-w-4xl">
        <Link
          href="/"
          className="mb-8 inline-flex items-center gap-2 rounded-full border border-white/25 px-4 py-2 text-sm font-semibold text-white/95 transition-colors hover:bg-white/10"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Volver
        </Link>
      </div>
    </main>
  )
}
