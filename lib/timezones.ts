import tzlookup from "tz-lookup";

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

/**
 * IANA time zone from the host environment (`Intl` resolved options).
 * In browsers this reflects the system / automatic time zone setting.
 */
export function getResolvedTimeZone(): string {
  if (typeof Intl === "undefined") return "UTC";
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (typeof tz === "string" && tz.length > 0) return tz;
  } catch {
    /* ignore */
  }
  return "UTC";
}

/**
 * IANA zone for the device’s **approximate location** using the Geolocation API plus the
 * bundled `tz-lookup` table (no HTTP; coordinates never leave the client except into this
 * local map).
 *
 * Falls back to {@link getResolvedTimeZone} when geolocation is unavailable, denied,
 * times out, or lookup throws.
 */
export async function getLocalTimeZone(): Promise<string> {
  const fallback = getResolvedTimeZone();

  if (typeof window === "undefined" || !navigator.geolocation) {
    return fallback;
  }

  return new Promise((resolve) => {
    const done = (tz: string) => resolve(tz);
    const timer = window.setTimeout(() => done(fallback), 120_000);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        window.clearTimeout(timer);
        try {
          const tz = tzlookup(pos.coords.latitude, pos.coords.longitude);
          if (typeof tz === "string" && tz.length > 0) {
            done(tz);
            return;
          }
        } catch {
          /* invalid coords or lookup edge case */
        }
        done(fallback);
      },
      () => {
        window.clearTimeout(timer);
        done(fallback);
      },
      {
        enableHighAccuracy: false,
        maximumAge: 300_000,
        timeout: 9000,
      },
    );
  });
}

/** System / OS time zone from `Intl` (same as {@link getResolvedTimeZone}). */
export function getSystemTimeZone(): string {
  return getResolvedTimeZone();
}

/** `GMT±n` style label for `timeZone` at `instant` (DST-aware). */
export function formatGmtOffsetLabel(instant: Date, timeZone: string): string {
  try {
    // en-US: `timeZoneName: "shortOffset"` reliably yields strings like "GMT+1" / "GMT-5:30".
    // Other locales can use different wording or omit this part shape, so we pin a stable locale
    // for this machine-readable offset label only (not for end-user UI language).
    const dtf = new Intl.DateTimeFormat("en-US", {
      timeZone,
      timeZoneName: "shortOffset",
    });
    const parts = dtf.formatToParts(instant);
    const name = parts.find((p) => p.type === "timeZoneName")?.value;
    if (name) return name;
  } catch {
    /* fall through */
  }
  return "UTC";
}

/**
 * Locale-appropriate day period (e.g. AM/PM) for wall time in `timeZone` at `instant`.
 */
export function formatZonedDayPeriod(instant: Date, timeZone: string): string {
  try {
    const dtf = new Intl.DateTimeFormat(undefined, {
      timeZone,
      hour: "numeric",
      hour12: true,
    });
    const dp = dtf
      .formatToParts(instant)
      .find((p) => p.type === "dayPeriod")?.value;
    if (dp) return dp;
  } catch {
    /* ignore */
  }
  try {
    // When `dayPeriod` is missing, parse a numeric hour in 24h form. en-GB + hour12:false
    // gives a consistent 0–23 `hour` part for arithmetic AM/PM (same pattern as
    // wallClockDateForTimeZone). We avoid en-US here so behavior stays aligned with that helper.
    const dtf = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hour: "numeric",
      hour12: false,
    });
    const h = Number(
      dtf.formatToParts(instant).find((p) => p.type === "hour")?.value,
    );
    if (!Number.isNaN(h)) return h < 12 ? "AM" : "PM";
  } catch {
    /* ignore */
  }
  return "";
}

/**
 * Builds a `Date` whose **calendar `getHours` / `getMinutes` / `getSeconds` values** (in the
 * **browser’s** local timezone) equal the wall-clock time in **`timeZone`** at **`instant`**.
 *
 * This is **not** a general “convert this instant to another zone” API. `react-clock` reads time
 * via those local getters on whatever `Date` you pass; it has no `timeZone` prop. So we:
 * 1. Format `instant` in `timeZone` and read off hour, minute, second (24h, see below).
 * 2. Put those numbers into `new Date(2000, 0, 1, h, m, s)` so the browser’s getters return `h,m,s`.
 * The date part is arbitrary; only the clock hands use the time fields.
 *
 * @param instant A single point in local time (e.g. `new Date()`).
 * @param timeZone IANA name (e.g. `"Europe/Warsaw"`). Defines **which zone’s wall clock** to read.
 */
export function wallClockDateForTimeZone(instant: Date, timeZone: string): Date {
  try {
    // en-GB + hour12:false: stable 24-hour numeric parts for hour/minute/second (avoids 12h
    // ambiguity when parsing `formatToParts`). Same rationale as the AM/PM fallback in
    // formatZonedDayPeriod.
    const dtf = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
      hour12: false,
    });
    const parts = dtf.formatToParts(instant);
    const n = (type: Intl.DateTimeFormatPartTypes) =>
      Number(parts.find((p) => p.type === type)?.value ?? 0);
    return new Date(2000, 0, 1, n("hour"), n("minute"), n("second"));
  } catch {
    return instant;
  }
}
