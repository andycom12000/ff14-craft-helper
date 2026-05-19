import { trackEvent } from '@/utils/analytics'

export function emitApiFailure(
  api: 'universalis' | 'xivapi',
  endpoint: string,
  status: number,
  retryCount: number,
) {
  const cleanEndpoint = endpoint.split('?')[0]
  trackEvent('api_failure', {
    api,
    endpoint: cleanEndpoint,
    status,
    retry_count: retryCount,
  })
}
