import { errorJson, json, type RouteContext } from '../../_lib/http'
import { buildStopSearchUrl, fetchTransportApi, UpstreamError } from '../../_lib/trafiklab'

export async function onRequestGet({ request }: RouteContext): Promise<Response> {
  try {
    const url = new URL(request.url)
    const query = url.searchParams.get('q') ?? ''
    const payload = await fetchTransportApi<Record<string, unknown>>(buildStopSearchUrl(query))
    return json(payload)
  } catch (error) {
    if (error instanceof UpstreamError) {
      return errorJson(error.status, 'upstream_error', error.message)
    }

    if (error instanceof Error) {
      return errorJson(400, 'invalid_request', error.message)
    }

    console.error(error)
    return errorJson(500, 'internal_error', 'Unexpected server error')
  }
}
