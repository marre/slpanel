export interface RouteContext<Env = Record<string, unknown>, Params = Record<string, string>> {
  request: Request
  env: Env
  params: Params
}

export interface ApiErrorBody {
  error: string
  details?: string
}

export function json<T>(body: T, init?: ResponseInit): Response {
  return Response.json(body, init)
}

export function errorJson(status: number, error: string, details?: string): Response {
  return json<ApiErrorBody>({ error, details }, { status })
}

export async function readJson<T>(request: Request): Promise<T> {
  const contentType = request.headers.get('content-type') ?? ''

  if (!contentType.includes('application/json')) {
    throw new Error('Expected application/json request body')
  }

  return (await request.json()) as T
}
