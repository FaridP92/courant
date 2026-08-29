import { Component, lazy, Suspense, type ComponentProps, type ReactNode } from 'react'

// ECharts pèse lourd : chargé en chunk séparé après le premier rendu (ADR-0001).
// Toutes les cartes graphiques passent par ce point d'entrée unique.
export const EChart = lazy(() => import('./EChart.tsx').then((m) => ({ default: m.EChart })))

export type EChartProps = ComponentProps<typeof EChart>

interface BoundaryProps {
  heightClass: string
  children: ReactNode
}

/** Un graphe qui crashe ne doit jamais emporter la page : il s'excuse et laisse la place. */
class ChartErrorBoundary extends Component<BoundaryProps, { failed: boolean }> {
  override state = { failed: false }

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true }
  }

  override render() {
    if (this.state.failed) {
      return (
        <div
          className={`flex items-center justify-center font-data text-sm text-ink-40 ${this.props.heightClass}`}
        >
          Graphique momentanément indisponible
        </div>
      )
    }
    return this.props.children
  }
}

export function ChartSlot({ heightClass, children }: BoundaryProps) {
  return (
    <ChartErrorBoundary heightClass={heightClass}>
      <Suspense fallback={<div className={heightClass} aria-hidden="true" />}>{children}</Suspense>
    </ChartErrorBoundary>
  )
}
