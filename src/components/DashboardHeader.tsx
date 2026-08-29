import { useEffect, useState } from 'react'
import { formatFreshness, formatParisClock, formatParisDate } from '../lib/format.ts'

interface DashboardHeaderProps {
  /** ts (UTC) du dernier point complet ; null si la donnée est indisponible. */
  freshTs: string | null
}

export function DashboardHeader({ freshTs }: DashboardHeaderProps) {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const id = setInterval(() => {
      setNow(new Date())
    }, 1000)
    return () => {
      clearInterval(id)
    }
  }, [])

  return (
    <header className="mx-auto flex w-full max-w-[1360px] flex-wrap items-center gap-x-7 gap-y-3 px-7 pt-4 pb-3">
      <div className="flex items-center gap-3">
        <svg width="38" height="38" viewBox="0 0 32 32" aria-hidden="true">
          <rect width="32" height="32" rx="7" fill="#0f1a20" stroke="#223440" />
          <path
            d="M4 19h6l3-11 5 17 3-9h7"
            fill="none"
            stroke="#2ee6ff"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <div>
          <h1 className="font-display text-[26px] leading-none font-extrabold tracking-[0.06em] text-ink-100 [font-stretch:118%]">
            COURANT
          </h1>
          <p className="mt-1 font-data text-[11px] tracking-[0.18em] text-ink-40 uppercase">
            L'électricité française en direct
          </p>
        </div>
      </div>

      <div className="ml-auto flex flex-wrap items-center gap-x-5 gap-y-2">
        <div className="text-right">
          <time
            dateTime={now.toISOString()}
            className="block font-display text-[26px] leading-none font-bold text-ink-100 [font-stretch:112%]"
          >
            {formatParisClock(now)}
          </time>
          <p className="mt-0.5 font-data text-[11.5px] text-ink-40">
            {formatParisDate(now)} · Europe/Paris
          </p>
        </div>
        {freshTs !== null && (
          <p className="flex items-center gap-2 rounded-full border border-line-strong bg-panel px-3.5 py-1.5 font-data text-xs text-ink-60">
            <span className="live-dot" aria-hidden="true" />
            <span className="font-semibold tracking-[0.1em] text-accent">LIVE</span>
            <span>{formatFreshness(freshTs)}</span>
          </p>
        )}
        <a
          className="border-b border-dashed border-line-strong pb-0.5 font-data text-[12.5px] text-ink-60 no-underline transition-colors hover:border-accent hover:text-accent"
          href="https://github.com/FaridP92/courant"
        >
          Sous le capot
        </a>
      </div>
    </header>
  )
}
