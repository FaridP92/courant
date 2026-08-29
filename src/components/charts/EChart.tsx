import { useEffect, useRef } from 'react'
import { echarts } from './echartsSetup.ts'

interface EChartProps {
  option: object
  /** Même groupe = crosshair synchronisé entre graphes (la colonne du temps). */
  group?: string
  ariaLabel: string
  className: string
  onClick?: (params: unknown) => void
}

export function EChart({ option, group, ariaLabel, className, onClick }: EChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<echarts.ECharts | null>(null)
  const clickRef = useRef<EChartProps['onClick']>(onClick)

  useEffect(() => {
    clickRef.current = onClick
  }, [onClick])

  useEffect(() => {
    const el = containerRef.current
    if (el === null) return
    const chart = echarts.init(el)
    chartRef.current = chart
    if (group !== undefined) {
      chart.group = group
      echarts.connect(group)
    }
    chart.on('click', (params) => {
      clickRef.current?.(params)
    })
    const observer = new ResizeObserver(() => {
      chart.resize()
    })
    observer.observe(el)
    return () => {
      observer.disconnect()
      chart.dispose()
      chartRef.current = null
    }
  }, [group])

  useEffect(() => {
    // nos options sont structurellement valides pour ECharts, mais typées maison.
    // Fusion plutôt que remplacement (notMerge) : l'état interne du dataZoom survit
    // aux refetchs de 60 s, le zoom de l'utilisateur n'est jamais remis à zéro.
    // replaceMerge sur series : une filière masquée disparaît vraiment au lieu de
    // laisser une série orpheline fusionnée.
    chartRef.current?.setOption(option as unknown as Parameters<echarts.ECharts['setOption']>[0], {
      replaceMerge: ['series'],
    })
  }, [option])

  return <div ref={containerRef} role="img" aria-label={ariaLabel} className={className} />
}
