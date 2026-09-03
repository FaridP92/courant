import { useState } from 'react'

/** Le chat "Pose ta question" : la question part vers /api/chat (fonction
 * serveur), qui répond toujours par un texte honnête. Le SQL exécuté est
 * montré tel quel (transparence), et la limite du périmètre est affichée. */

const SUGGESTED_QUESTIONS = [
  'La France exporte-t-elle en ce moment ?',
  'Record de consommation cet hiver ?',
  'Part du solaire hier à midi ?',
  'Combien de jours rouges Tempo la saison dernière ?',
  'Quelle région a consommé le plus hier ?',
  'Intensité CO2 moyenne de la semaine ?',
]

const NETWORK_ERROR = 'Le chat est momentanément indisponible, réessaie dans un instant.'

interface Exchange {
  question: string
  answer: string | null
  sql?: string
}

export function ChatSection() {
  const [draft, setDraft] = useState('')
  const [exchanges, setExchanges] = useState<readonly Exchange[]>([])
  const pending = exchanges.some((e) => e.answer === null)

  const ask = (rawQuestion: string) => {
    const question = rawQuestion.trim()
    if (question === '' || pending) return
    setDraft('')
    setExchanges((current) => [...current, { question, answer: null }])
    void (async () => {
      let answer = NETWORK_ERROR
      let sql: string | undefined
      try {
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ question }),
        })
        const payload = (await response.json()) as { answer?: unknown; sql?: unknown }
        if (typeof payload.answer === 'string') answer = payload.answer
        if (typeof payload.sql === 'string') sql = payload.sql
      } catch {
        // la valeur par défaut dit déjà l'indisponibilité
      }
      setExchanges((current) =>
        current.map((e) =>
          e.question === question && e.answer === null
            ? { question, answer, ...(sql === undefined ? {} : { sql }) }
            : e,
        ),
      )
    })()
  }

  return (
    <section
      aria-label="Pose ta question"
      className="rounded-(--radius-card) border border-line bg-panel p-4 shadow-(--shadow-card)"
    >
      <h2 className="mb-2 font-data text-[11px] font-semibold tracking-[0.16em] text-ink-40 uppercase">
        Pose ta question{' '}
        <span className="font-normal tracking-normal normal-case">
          réponses calculées sur les données du tableau de bord
        </span>
      </h2>

      {exchanges.length === 0 && (
        <p className="mb-2 text-[13px] text-ink-60">
          Interroge librement les données : consommation, production, échanges, Tempo, Ecowatt...
        </p>
      )}

      <div aria-live="polite" className="flex flex-col gap-2.5">
        {exchanges.map((exchange, index) => (
          <div key={`${String(index)}-${exchange.question}`}>
            <p className="font-data text-[12px] text-ink-40">{exchange.question}</p>
            {exchange.answer === null ? (
              <p className="mt-0.5 text-[13.5px] text-ink-60">Je consulte les données...</p>
            ) : (
              <>
                <p className="mt-0.5 text-[13.5px] leading-relaxed text-ink-100">
                  {exchange.answer}
                </p>
                {exchange.sql !== undefined && (
                  <details className="mt-1">
                    <summary className="cursor-pointer font-data text-[10.5px] text-ink-40 hover:text-accent">
                      voir la requête SQL
                    </summary>
                    <code className="mt-1 block overflow-x-auto rounded-md bg-abyss p-2 font-data text-[10.5px] break-all whitespace-pre-wrap text-ink-60">
                      {exchange.sql}
                    </code>
                  </details>
                )}
              </>
            )}
          </div>
        ))}
      </div>

      <form
        className="mt-3 flex gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          ask(draft)
        }}
      >
        <input
          type="text"
          value={draft}
          maxLength={300}
          aria-label="Ta question"
          placeholder="Ex. : la France importe-t-elle ce soir ?"
          onChange={(event) => {
            setDraft(event.target.value)
          }}
          className="min-w-0 flex-1 rounded-md border border-line-strong bg-raised px-3 py-2 text-[13.5px] text-ink-100 placeholder:text-ink-40 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
        />
        <button
          type="submit"
          disabled={pending || draft.trim() === ''}
          className="rounded-md border border-line-strong px-3.5 py-2 font-data text-xs text-ink-60 transition-colors hover:border-accent hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-40"
        >
          Demander
        </button>
      </form>

      <p className="mt-2.5 flex flex-wrap gap-1.5">
        {SUGGESTED_QUESTIONS.map((question) => (
          <button
            key={question}
            type="button"
            disabled={pending}
            onClick={() => {
              ask(question)
            }}
            className="rounded-full border border-line px-2.5 py-1 font-data text-[11px] text-ink-60 transition-colors hover:border-accent hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent disabled:opacity-40"
          >
            {question}
          </button>
        ))}
      </p>

      <p className="mt-2.5 font-data text-[10.5px] text-ink-40">
        Réponses générées par IA (Mistral) à partir des seules données publiques du tableau de bord
        ; la requête exécutée est affichée. En cas de doute, la donnée brute fait foi.
      </p>
    </section>
  )
}
