import type { Display } from '../../../src/lib/types'
import { createDisplay, listDisplays, type D1DatabaseLike } from '../../_lib/displays'
import { errorJson, json, readJson, type RouteContext } from '../../_lib/http'
import { ValidationError, isValidOwnerId, parseCreateDisplayInput } from '../../_lib/validation'

interface Env {
  DB: D1DatabaseLike
}

function handleError(error: unknown): Response {
  if (error instanceof ValidationError) {
    return errorJson(400, 'invalid_request', error.message)
  }

  if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
    return errorJson(409, 'conflict', error.message)
  }

  console.error(error)
  return errorJson(500, 'internal_error', 'Unexpected server error')
}

export async function onRequestGet({ request, env }: RouteContext<Env>): Promise<Response> {
  try {
    const url = new URL(request.url)
    const ownerId = url.searchParams.get('owner')?.trim() ?? ''

    if (!isValidOwnerId(ownerId)) {
      return errorJson(400, 'invalid_request', 'owner must be an 8-character alphanumeric string')
    }

    const displays = await listDisplays(env.DB, ownerId)
    return json<Display[]>(displays)
  } catch (error) {
    return handleError(error)
  }
}

export async function onRequestPost({ request, env }: RouteContext<Env>): Promise<Response> {
  try {
    const payload = parseCreateDisplayInput(await readJson(request))
    const display = await createDisplay(env.DB, payload)
    return json<Display>(display, { status: 201 })
  } catch (error) {
    return handleError(error)
  }
}
