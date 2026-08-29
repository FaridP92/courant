/**
 * Point d'enregistrement unique des modules ECharts (tree-shaking).
 * Tout code qui touche echarts/core DOIT importer echarts depuis ce module :
 * un import direct de echarts/core ailleurs risque d'exécuter registerMap ou init
 * avant l'enregistrement des composants (écran noir vécu en Phase 3).
 */
import * as echarts from 'echarts/core'
import { LineChart, LinesChart, MapChart } from 'echarts/charts'
import {
  DataZoomComponent,
  GeoComponent,
  GridComponent,
  MarkLineComponent,
  TooltipComponent,
} from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'

echarts.use([
  LineChart,
  LinesChart,
  MapChart,
  DataZoomComponent,
  GeoComponent,
  GridComponent,
  MarkLineComponent,
  TooltipComponent,
  CanvasRenderer,
])

export { echarts }
