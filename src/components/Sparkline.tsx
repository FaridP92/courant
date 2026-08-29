import { buildSparkline } from '../lib/sparkline.ts'

interface SparklineProps {
  values: readonly (number | null)[]
  color: string
  filled?: boolean
}

const BOX = { width: 120, height: 30 }

/** Mini-courbe décorative des KPI (l'information est portée par le chiffre, pas par elle). */
export function Sparkline({ values, color, filled = false }: SparklineProps) {
  const paths = buildSparkline(values, BOX)
  if (paths === null) return null
  return (
    <svg
      viewBox={`0 0 ${String(BOX.width)} ${String(BOX.height)}`}
      preserveAspectRatio="none"
      aria-hidden="true"
      className="block h-[30px] w-full"
    >
      {filled && <path d={paths.areaPath} fill={color} opacity={0.14} />}
      <path
        d={paths.linePath}
        fill="none"
        stroke={color}
        strokeWidth={1.8}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}
