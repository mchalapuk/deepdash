/** Small subset when `Intl.supportedValuesOf` is unavailable (bundled, no network). */
const FALLBACK_TIME_ZONES = [
  "UTC",
  "Africa/Abidjan",
  "America/Argentina/Buenos_Aires",
  "America/Chicago",
  "America/Los_Angeles",
  "America/New_York",
  "America/Sao_Paulo",
  "America/Mexico_City",
  "America/Toronto",
  "America/Vancouver",
  "Asia/Kolkata",
  "Asia/Tokyo",
  "Asia/Shanghai",
  "Australia/Sydney",
  "Europe/Berlin",
  "Europe/London",
  "Europe/Warsaw",
  "Europe/Madrid",
  "Europe/Paris",
  "Europe/Rome",
  "Europe/Lisbon",
  "Europe/Amsterdam",
  "Europe/Berlin",
  "Europe/London",
  "Europe/Warsaw",
  "Pacific/Auckland",
] as const;

export function getSupportedTimeZones(): readonly string[] {
  try {
    const supportedValuesOf = (
      Intl as unknown as { supportedValuesOf?: (key: string) => string[] }
    ).supportedValuesOf;
    if (typeof supportedValuesOf === "function") {
      return supportedValuesOf.call(Intl, "timeZone");
    }
  } catch {
    /* ignore */
  }
  return FALLBACK_TIME_ZONES;
}
