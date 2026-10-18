import type { Host } from "../platform";

/** Native onError payloads can cross realms and need not be instanceof Error. */
export function runtimeErrorMessage(reason: unknown): string {
  if (reason && typeof reason === "object") {
    const details = reason as Record<string, unknown>;
    for (const key of ["stack", "message", "errMsg"]) if (typeof details[key] === "string" && details[key]) return details[key];
  }
  return String(reason);
}

/** Capture only platform/version fields, never opaque account or device payloads. */
export function platformDetails(host: Host): Record<string, unknown> {
  const read = (name: string, getter: () => Record<string, unknown> | undefined) => {
    try { return getter() ?? {}; } catch (error) { host.log("full-diagnostic-unavailable", { name, reason: String(error) }); return {}; }
  };
  const { wx } = host, legacy = !wx.getDeviceInfo || !wx.getAppBaseInfo ? read("getSystemInfoSync", () => wx.getSystemInfoSync()) : {};
  const values = { ...legacy, ...read("getDeviceInfo", () => wx.getDeviceInfo?.()), ...read("getAppBaseInfo", () => wx.getAppBaseInfo?.()) };
  return Object.fromEntries(["platform", "system", "brand", "model", "SDKVersion", "version", "language", "benchmarkLevel"].map(key => [key, values[key] ?? null]));
}
