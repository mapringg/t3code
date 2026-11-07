interface ThreadDismissal {
  readonly finished: Promise<void>;
  readonly restore: () => void;
}

const rows = new Map<string, Set<() => ThreadDismissal>>();

export function registerThreadDismissal(key: string, dismiss: () => ThreadDismissal) {
  const registrations = rows.get(key) ?? new Set();
  registrations.add(dismiss);
  rows.set(key, registrations);
  return () => {
    registrations.delete(dismiss);
    if (registrations.size === 0) rows.delete(key);
  };
}

export async function withThreadDismissal<T>(
  key: string,
  action: () => Promise<T>,
  succeeded: (result: T) => boolean,
): Promise<T> {
  const dismissals = Array.from(rows.get(key) ?? [], (dismiss) => dismiss());
  let committed = false;
  try {
    await Promise.all(dismissals.map(({ finished }) => finished));
    const result = await action();
    committed = succeeded(result);
    return result;
  } finally {
    if (!committed) dismissals.forEach(({ restore }) => restore());
  }
}

/**
 * For actions that keep the thread on screen and only move it (pin, unpin, wake, unsettle):
 * no exit animation, so the change applies at once and the list slides the row to its place.
 */
export function withoutThreadDismissal<T>(
  _key: string,
  action: () => Promise<T>,
  _succeeded: (result: T) => boolean,
): Promise<T> {
  return action();
}
