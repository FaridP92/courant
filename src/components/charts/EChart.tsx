import { useEffect, useRef } from 'react'
import * as echarts from 'echarts/core'
import { LineChart } from 'echarts/charts'
import { GridComponent, MarkLineComponent, TooltipComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import type { TimeColumnChartOption } from './chartOptions.ts'

echarts.use([LineChart, GridComponent, MarkLineComponent, TooltipComponent, CanvasRenderer])

interface EChartProps {
  option: TimeColumnChartOption
  /** Même groupe = crosshair synchronisé entre graphes (la colonne du temps). */
  group?: string
  ariaLabel: string
  className: string
}

export function EChart({ option, group, ariaLabel, className }: EChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<echarts.ECharts | null>(null)

  useEffect(() => {
    const el = containerRef.current
    if (el === null) return
    const chart = echarts.init(el)
    chartRef.current = chart
    if (group !== undefined) {
      chart.group = group
      echarts.connect(group)
    }
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
    // nos options sont structurellement valides pour ECharts, mais typées maison (voir chartOptions.ts)
    chartRef.current?.setOption(
      option as unknown as Parameters<echarts.ECharts['setOption']>[0],
      true,
    )
  }, [option])

  return <div ref={containerRef} role="img" aria-label={ariaLabel} className={className} />
}
