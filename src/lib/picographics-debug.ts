declare global {
  interface Window {
    __slpanelPicographicsDebug?: boolean;
  }
}

function isPicographicsDebugEnabled() {
  return globalThis.window?.__slpanelPicographicsDebug === true;
}

export function logPicographicsInfo(
  scope: string,
  event: string,
  payload: Record<string, unknown>,
) {
  if (!isPicographicsDebugEnabled()) {
    return;
  }

  console.info(scope, event, payload);
}

export function logPicographicsError(
  scope: string,
  event: string,
  error: unknown,
) {
  if (!isPicographicsDebugEnabled()) {
    return;
  }

  console.error(scope, event, error);
}
