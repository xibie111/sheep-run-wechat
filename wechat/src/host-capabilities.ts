/** Missing-only installation, without platform entry-point side effects. */
export function fillMissing(target: Record<string, any>, key: string, value: unknown, changes: string[], label = key): void {
  if (target[key] !== undefined && target[key] !== null) return;
  const descriptor = Object.getOwnPropertyDescriptor(target, key);
  if (descriptor && !descriptor.configurable && !descriptor.writable && !descriptor.set) {
    throw new Error(`Required host property is unavailable and read-only: ${label}`);
  }
  if (descriptor?.configurable) Object.defineProperty(target, key, { value, writable: true, configurable: true });
  else target[key] = value;
  changes.push(label);
}
