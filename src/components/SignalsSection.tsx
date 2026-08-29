import { useState } from 'react'
import type { EcowattDay, TempoColor, TempoSnapshot } from '../lib/api.ts'
import { formatFreshness } from '../lib/format.ts'
import { ecowattDaySummary, ecowattNote, formatDayShort, tempoNote } from '../lib/signals.ts'

type QueryStatus = 'pending' | 'error' | 'success'

/* Vert / orange / rouge : usage exclusif des signaux (règle 9 du projet). */
const ECOWATT_LEVELS: Record<
  1 | 2 | 3,
  { word: string; dotClass: string; wordClass: string; tileClass: string }
> = {
  1: {
    word: 'Vert',
    dotClass: 'bg-signal-ok',
    wordClass: 'text-signal-ok',
    tileClass: 'border-line',
  },
  2: {
    word: 'Tendu',
    dotClass: 'bg-signal-tense',
    wordClass: 'text-signal-tense',
    tileClass: 'border-signal-tense',
  },
  3: {
    // « Très tendu » : aligné sur la note, et jamais en collision avec le Rouge Tempo
    word: 'Très tendu',
    dotClass: 'bg-signal-critical',
    wordClass: 'text-signal-critical',
    tileClass: 'border-signal-critical',
  },
}

const TEMPO_LEVELS: Record<
  TempoColor,
  { word: string; dotClass: string; wordClass: string; tileClass: string }
> = {
  BLUE: {
    word: 'Bleu',
    dotClass: 'bg-tempo-blue',
    wordClass: 'text-ink-100',
    tileClass: 'border-line',
  },
  WHITE: {
    word: 'Blanc',
    dotClass: 'bg-tempo-white',
    wordClass: 'text-ink-100',
    tileClass: 'border-line',
  },
  RED: {
    word: 'Rouge',
    dotClass: 'bg-tempo-red',
    wordClass: 'text-tempo-red',
    tileClass: 'border-tempo-red',
  },
}

/** hvalue 0 = vert + production décarbonée, 1 = vert. La hauteur double la couleur
 * (plus c'est haut, plus c'est tendu) pour ne jamais coder par la couleur seule. */
const HOUR_CLASSES: Record<number, string> = {
  0: 'h-2 bg-signal-ok',
  1: 'h-2 bg-signal-ok opacity-60',
  2: 'h-3 bg-signal-tense',
  3: 'h-3.5 bg-signal-critical',
}

function TileContent({
  label,
  word,
  dotClass,
  wordClass,
}: {
  label: string
  word: string
  dotClass: string
  wordClass: string
}) {
  // des span (contenu de phrasé) : TileContent vit aussi dans un <button>
  return (
    <>
      <span className="block font-data text-[10.5px] tracking-[0.08em] text-ink-40 uppercase">
        {label}
      </span>
      <span
        className={`mx-auto my-1.5 block h-3 w-3 rounded-full ${dotClass}`}
        aria-hidden="true"
      />
      <span className={`block font-data text-[11px] font-semibold ${wordClass}`}>{word}</span>
    </>
  )
}

function SignalTile(props: {
  label: string
  word: string
  dotClass: string
  wordClass: string
  tileClass: string
}) {
  return (
    <div
      className={`rounded-(--radius-chip) border bg-raised px-1.5 py-2 text-center ${props.tileClass}`}
    >
      <TileContent {...props} />
    </div>
  )
}

function EcowattTile({
  day,
  pressed,
  onToggle,
}: {
  day: EcowattDay
  pressed: boolean
  onToggle: () => void
}) {
  const level = ECOWATT_LEVELS[day.dvalue]
  return (
    <button
      type="button"
      aria-expanded={pressed}
      aria-controls="ecowatt-detail"
      title={pressed ? 'Replier le détail horaire' : 'Voir le détail heure par heure'}
      onClick={onToggle}
      className={`rounded-(--radius-chip) border bg-raised px-1.5 py-2 text-center transition-colors hover:border-accent focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-accent ${pressed ? 'border-accent' : level.tileClass}`}
    >
      <TileContent label={formatDayShort(day.day)} {...level} />
    </button>
  )
}

/** Bande des 24 pas horaires : la couleur porte le détail, le résumé textuel le double. */
function EcowattDayDetail({ day }: { day: EcowattDay }) {
  const byPas = new Map((day.hours ?? []).map((h) => [h.pas, h.hvalue]))
  return (
    <div className="mt-2" id="ecowatt-detail">
      {/* bande décorative : le résumé textuel en dessous porte toute l'information */}
      <div
        className="grid grid-cols-[repeat(24,1fr)] items-end gap-px overflow-hidden"
        aria-hidden="true"
      >
        {Array.from({ length: 24 }, (_, pas) => {
          const hvalue = byPas.get(pas)
          const hourClass =
            hvalue === undefined
              ? 'h-2 border border-dashed border-line-strong bg-transparent'
              : (HOUR_CLASSES[hvalue] ?? 'h-2 border border-dashed border-line-strong')
          return (
            <span key={pas} title={`${String(pas)} h`} className={`rounded-[1px] ${hourClass}`} />
          )
        })}
      </div>
      <p
        className="mt-0.5 flex justify-between font-data text-[9px] text-ink-40"
        aria-hidden="true"
      >
        <span>0 h</span>
        <span>12 h</span>
        <span>24 h</span>
      </p>
      <p className="mt-1 font-data text-[11px] text-ink-60">
        {formatDayShort(day.day)} : {ecowattDaySummary(day)}
      </p>
      <p className="mt-0.5 font-data text-[9.5px] text-ink-40">
        vert plein = bas carbone · vert pâle = vert · orange = tendu · rouge = très tendu · case
        vide : non publié
      </p>
    </div>
  )
}

function frenchCount(n: number, singular: string): string {
  return `${String(n)} ${singular}${n > 1 ? 's' : ''}`
}

export function SignalsSection({
  ecowatt,
  ecowattStatus,
  tempo,
  tempoStatus,
  today,
}: {
  ecowatt: readonly EcowattDay[]
  ecowattStatus: QueryStatus
  tempo: TempoSnapshot | null
  tempoStatus: QueryStatus
  today: string
}) {
  const [selectedDay, setSelectedDay] = useState<string | null>(null)
  // la note et la fraîcheur se calculent sur exactement les jours affichés en tuiles,
  // jamais sur des jours passés ou au-delà de l'horizon visible
  const days = ecowatt.filter((d) => d.day >= today).slice(0, 4)
  const note = ecowattNote(days, today)
  const generatedAt = days[0]?.generated_at ?? null
  const selected = days.find((d) => d.day === selectedDay) ?? null
  const tempoFreshness =
    tempo === null ? null : (tempo.tomorrow_updated_at ?? tempo.today_updated_at)

  return (
    <article
      className="rounded-(--radius-card) border border-line bg-panel p-4 shadow-(--shadow-card)"
      aria-label="Signaux Ecowatt et Tempo"
    >
      <h2 className="mb-3 font-data text-[11px] font-semibold tracking-[0.16em] text-ink-40 uppercase">
        Signaux{' '}
        <span className="font-normal tracking-normal normal-case">
          Ecowatt et Tempo, couleurs officielles RTE
        </span>
      </h2>
      <div className="grid grid-cols-1 gap-4 min-[380px]:grid-cols-2">
        <div>
          <h3 className="mb-2 font-data text-[11px] font-semibold tracking-[0.14em] text-ink-40 uppercase">
            Ecowatt{' '}
            <span className="font-normal tracking-normal normal-case">
              chaque jour déplie son détail heure par heure
            </span>
          </h3>
          {/* trois états : contenu, chargement silencieux, indisponibilité dite */}
          {days.length > 0 ? (
            <>
              <div className="grid grid-cols-4 gap-2">
                {days.map((d) => (
                  <EcowattTile
                    key={d.day}
                    day={d}
                    pressed={selectedDay === d.day}
                    onToggle={() => {
                      setSelectedDay((current) => (current === d.day ? null : d.day))
                    }}
                  />
                ))}
              </div>
              {selected !== null && <EcowattDayDetail day={selected} />}
              {note !== null && <p className="mt-2 text-[12.5px] text-ink-60">{note}</p>}
              {generatedAt !== null && (
                <p className="mt-1.5 font-data text-[10.5px] text-ink-40">
                  Signal RTE, {formatFreshness(generatedAt)}
                </p>
              )}
            </>
          ) : ecowattStatus === 'pending' ? null : (
            <p className="font-data text-sm text-ink-40">
              Signal Ecowatt indisponible pour le moment.
            </p>
          )}
        </div>
        <div>
          <h3 className="mb-2 font-data text-[11px] font-semibold tracking-[0.14em] text-ink-40 uppercase">
            Tempo
          </h3>
          {tempo !== null ? (
            <>
              <div className="grid grid-cols-2 gap-2">
                {tempo.today_color === null ? (
                  <SignalTile
                    label="Aujourd'hui"
                    word="Non publié"
                    dotClass="border border-dashed border-line-strong bg-transparent"
                    wordClass="text-ink-40"
                    tileClass="border-line"
                  />
                ) : (
                  <SignalTile label="Aujourd'hui" {...TEMPO_LEVELS[tempo.today_color]} />
                )}
                {tempo.tomorrow_color === null ? (
                  <SignalTile
                    label="Demain"
                    word="À venir"
                    dotClass="border border-dashed border-line-strong bg-transparent"
                    wordClass="text-ink-40"
                    tileClass="border-line"
                  />
                ) : (
                  <SignalTile label="Demain" {...TEMPO_LEVELS[tempo.tomorrow_color]} />
                )}
              </div>
              <p className="mt-2 text-[12.5px] text-ink-60">{tempoNote(tempo)}</p>
              <p className="mt-1.5 font-data text-[10.5px] text-ink-40">
                Saison depuis le 1er septembre {tempo.season_start.slice(0, 4)} :{' '}
                {frenchCount(tempo.red_days_used, 'rouge')} ·{' '}
                {frenchCount(tempo.white_days_used, 'blanc')} ·{' '}
                {frenchCount(tempo.blue_days_used, 'bleu')}.
              </p>
              {tempoFreshness !== null && (
                <p className="font-data text-[10.5px] text-ink-40">
                  Publication RTE, {formatFreshness(tempoFreshness)}
                </p>
              )}
            </>
          ) : tempoStatus === 'pending' ? null : (
            <p className="font-data text-sm text-ink-40">
              Calendrier Tempo indisponible pour le moment.
            </p>
          )}
        </div>
      </div>
    </article>
  )
}
