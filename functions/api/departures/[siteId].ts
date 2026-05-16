import { errorJson, json, type RouteContext } from '../../_lib/http'
import {
  buildDeparturesUrl,
  fetchTransportApi,
  normalizeDeparturesResponse,
  UpstreamError,
} from '../../_lib/trafiklab'

interface Params {
  siteId: string
}

export async function onRequestGet({ params }: RouteContext<Record<string, unknown>, Params>): Promise<Response> {
  try {
    const payload = await fetchTransportApi<unknown>(buildDeparturesUrl(params.siteId))
    return json(normalizeDeparturesResponse(params.siteId, payload))
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
