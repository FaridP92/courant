import { useEffect, useState } from 'react'
import { useTheme } from '../hooks/useTheme.ts'
import { formatFreshness, formatParisClock, formatParisDate } from '../lib/format.ts'

interface DashboardHeaderProps {
  /** ts (UTC) du dernier point complet ; null si la donnée est indisponible. */
  freshTs: string | null
}

/** Rubriques de la page, dans l'ordre de lecture : la navigation est un plan de site. */
const SECTION_LINKS: readonly { href: string; label: string }[] = [
  { href: '#direct', label: 'En direct' },
  { href: '#regions', label: 'Régions' },
  { href: '#signaux', label: 'Ecowatt et Tempo' },
  { href: '#explorer', label: 'Explorer' },
  { href: '#compare', label: 'Ma facture' },
  { href: '#question', label: 'Poser une question' },
]

function ThemeToggle() {
  const { theme, toggle } = useTheme()
  const dark = theme === 'dark'
  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={dark}
      title={dark ? 'Passer au thème jour' : 'Passer au thème nuit'}
      className="chip cursor-pointer transition-colors hover:border-accent hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      <span aria-hidden="true">{dark ? '☀' : '☾'}</span>
      {dark ? 'Jour' : 'Nuit'}
    </button>
  )
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
    <header className="sticky top-0 z-20 border-b border-line bg-panel/85 backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-[1360px] flex-wrap items-center gap-x-6 gap-y-2 px-5 py-3 md:px-7">
        <a href="#direct" className="flex items-center gap-3 no-underline">
          <svg width="36" height="36" viewBox="0 0 32 32" aria-hidden="true">
            <rect width="32" height="32" rx="9" fill="var(--color-accent)" />
            <path
              d="M5 19h6l3-11 5 17 3-9h5"
              fill="none"
              stroke="#ffffff"
              strokeWidth="2.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span>
            <h1 className="font-display text-[22px] leading-none font-extrabold tracking-[-0.01em] text-ink-100 [font-stretch:112%]">
              Courant
            </h1>
            <span className="mt-0.5 block text-[12px] leading-none text-ink-40">
              L'électricité française en direct
            </span>
          </span>
        </a>

        <nav aria-label="Rubriques" className="order-last w-full md:order-none md:w-auto">
          <ul className="-mx-1 flex gap-1 overflow-x-auto py-1 text-[13.5px] font-medium text-ink-60">
            {SECTION_LINKS.map((link) => (
              <li key={link.href} className="shrink-0">
                <a
                  href={link.href}
                  className="block rounded-full px-3 py-1.5 no-underline transition-colors hover:bg-raised hover:text-ink-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="ml-auto flex flex-wrap items-center gap-x-3 gap-y-2">
          <div className="text-right">
            <time
              dateTime={now.toISOString()}
              className="block font-display text-[20px] leading-none font-bold text-ink-100 [font-stretch:110%]"
            >
              {formatParisClock(now)}
            </time>
            <p className="mt-0.5 text-[11.5px] leading-none text-ink-40">{formatParisDate(now)}</p>
          </div>
          {freshTs !== null && (
            <p className="chip">
              <span className="live-dot" aria-hidden="true" />
              <span className="font-semibold text-accent">En direct</span>
              <span>{formatFreshness(freshTs)}</span>
            </p>
          )}
          <ThemeToggle />
        </div>
      </div>
    </header>
  )
}
