"use client"

import type { ChatMessage } from "@/lib/types"
import { formatFecha, CATEGORIA_LABEL } from "@/lib/types"

// Vista imprimible. En pantalla está oculta (aria-hidden + off-screen via CSS de impresión).
// El CSS @media print en globals.css la muestra y oculta el resto.
export function FichaPrint({ message }: { message: ChatMessage | null }) {
  if (!message) return null
  return (
    <div id="ficha-print" aria-hidden="true" className="sr-only">
      <h1 style={{ fontSize: "20pt", marginBottom: "4pt" }}>Ventanilla</h1>
      <p style={{ marginBottom: "16pt", color: "#444" }}>Asistente de trámites de Salta</p>

      {message.pregunta && (
        <>
          <h2 style={{ fontSize: "13pt", marginBottom: "4pt" }}>Tu consulta</h2>
          <p style={{ marginBottom: "16pt" }}>{message.pregunta}</p>
        </>
      )}

      <h2 style={{ fontSize: "13pt", marginBottom: "4pt" }}>Respuesta</h2>
      <div style={{ whiteSpace: "pre-wrap", marginBottom: "16pt", lineHeight: 1.5 }}>
        {message.texto.replace(/\*\*/g, "")}
      </div>

      {message.fuentes && message.fuentes.length > 0 && (
        <>
          <h2 style={{ fontSize: "13pt", marginBottom: "4pt" }}>Fuentes oficiales</h2>
          <ul style={{ paddingLeft: "16pt" }}>
            {message.fuentes.map((f, i) => (
              <li key={i} style={{ marginBottom: "8pt" }}>
                <strong>{f.tramite}</strong> ({CATEGORIA_LABEL[f.categoria] ?? f.categoria})
                <br />
                {f.url}
                {f.ultima_verificacion && (
                  <>
                    <br />
                    <span style={{ color: "#444" }}>verificado el {formatFecha(f.ultima_verificacion)}</span>
                  </>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      <p style={{ marginTop: "24pt", fontSize: "9pt", color: "#666" }}>
        Documento generado por Ventanilla. Verificá siempre la información en la fuente oficial citada.
      </p>
    </div>
  )
}
