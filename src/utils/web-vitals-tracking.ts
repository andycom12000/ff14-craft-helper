import { onLCP, onCLS, onINP, onFCP, onTTFB, type Metric } from 'web-vitals'
import { trackEvent } from './analytics'

function send(metric: Metric) {
  trackEvent('web_vitals', {
    metric: metric.name,
    value: metric.name === 'CLS' ? Number(metric.value.toFixed(4)) : Math.round(metric.value),
    rating: metric.rating,
  })
}

export function registerWebVitals(): void {
  onLCP(send)
  onCLS(send)
  onINP(send)
  onFCP(send)
  onTTFB(send)
}
