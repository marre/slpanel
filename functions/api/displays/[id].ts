import type { Display } from '../../../src/lib/types'
import {
  deleteDisplay,
  getDisplay,
  updateDisplay,
  type D1DatabaseLike,
} from '../../_lib/displays'
import { errorJson, json, readJson, type RouteContext } from '../../_lib/http'
import { ValidationError, parseUpdateDisplayInput } from '../../_lib/validation'

interface Env {
  DB: D1DatabaseLike
}

interface Params {
  id: string
}

function handleError(error: unknown): Response {
  if (error instanceof ValidationError) {
    return errorJson(400, 'invalid_request', error.message)
  }

  console.error(error)
  return errorJson(500, 'internal_error', 'Unexpected server error')
}

export async function onRequestGet({ env, params }: RouteContext<Env, Params>): Promise<Response> {
  try {
    const display = await getDisplay(env.DB, params.id)

    if (!display) {
      return errorJson(404, 'not_found', 'Display not found')
    }

    return json<Display>(display)
  } catch (error) {
    return handleError(error)
  }
}

export async function onRequestPut({
  request,
  env,
  params,
}: RouteContext<Env, Params>): Promise<Response> {
  try {
    const payload = parseUpdateDisplayInput(await readJson(request))
    const display = await updateDisplay(env.DB, params.id, payload)

    if (!display) {
      return errorJson(404, 'not_found', 'Display not found')
    }

    return json<Display>(display)
  } catch (error) {
    return handleError(error)
  }
}

export async function onRequestDelete({
  env,
  params,
}: RouteContext<Env, Params>): Promise<Response> {
  try {
    const deleted = await deleteDisplay(env.DB, params.id)

    if (!deleted) {
      return errorJson(404, 'not_found', 'Display not found')
    }

    return new Response(null, { status: 204 })
  } catch (error) {
    return handleError(error)
  }
}
