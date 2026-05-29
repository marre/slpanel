const ALPHANUMERIC =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

export function composeDisplayResourceId(
  ownerId: string,
  displayId: string,
): string {
  return `${ownerId}-${displayId}`;
}

export function generateDisplayId(length = 12): string {
  const random = crypto.getRandomValues(new Uint8Array(length));

  return Array.from(random, (value) => {
    return ALPHANUMERIC[value % ALPHANUMERIC.length];
  }).join('');
}
