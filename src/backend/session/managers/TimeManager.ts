/**
 * TimeManager
 *
 * Centralized time utilities for date/time operations across the app.
 * Handles user timezone-aware date formatting, hour labels, and conversions.
 *
 * Usage:
 *   const timeManager = new TimeManager(timeZone);
 *   const today = timeManager.today(); // Gets today in user's timezone
 */

export class TimeManager {
  private timezone: string | undefined;

  constructor(timezone: string | undefined | null) {
    // Convert null to undefined for Intl.DateTimeFormat compatibility
    this.timezone = timezone ?? undefined;
  }

  /**
   * Get the configured timezone or resolve the system default
   * Returns IANA timezone string (e.g., "America/Los_Angeles")
   */
  getTimezone(): string {
    if (this.timezone) {
      return this.timezone;
    }
    // Resolve the system's default timezone using Intl API
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  }

  /**
   * Get today's date as YYYY-MM-DD string in user's timezone
   */
  today(): string {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      timeZone: this.timezone,
    });

    const parts = formatter.formatToParts(now);
    const year = parts.find((p) => p.type === "year")?.value || "2024";
    const month = parts.find((p) => p.type === "month")?.value || "01";
    const day = parts.find((p) => p.type === "day")?.value || "01";

    return `${year}-${month}-${day}`;
  }

  /**
   * Get a specific date as YYYY-MM-DD string in user's timezone
   */
  toDateString(date: Date): string {
    const formatter = new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      timeZone: this.timezone,
    });

    const parts = formatter.formatToParts(date);
    const year = parts.find((p) => p.type === "year")?.value || "2024";
    const month = parts.find((p) => p.type === "month")?.value || "01";
    const day = parts.find((p) => p.type === "day")?.value || "01";

    return `${year}-${month}-${day}`;
  }

  /**
   * Format hour (0-23) as 12-hour format with AM/PM
   * Examples: "9 AM", "2 PM", "12 AM"
   */
  formatHour(hour: number): string {
    const ampm = hour >= 12 ? "PM" : "AM";
    const hour12 = hour % 12 || 12;
    return `${hour12} ${ampm}`;
  }

  /**
   * Get current hour (0-23) in user's timezone
   */
  currentHour(): number {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat("en-US", {
      hour: "2-digit",
      hour12: false,
      timeZone: this.timezone,
    });

    const parts = formatter.formatToParts(now);
    const hour = parts.find((p) => p.type === "hour")?.value || "0";
    return parseInt(hour, 10);
  }

  /**
   * Get current time as ISO string
   */
  now(): string {
    return new Date().toISOString();
  }


  /**
   * Get the hour from a timestamp in user's timezone
   */
  hourFrom(timestamp: Date | string): number {
    const date = typeof timestamp === "string" ? new Date(timestamp) : timestamp;
    const formatter = new Intl.DateTimeFormat("en-US", {
      hour: "2-digit",
      hour12: false,
      timeZone: this.timezone,
    });

    const parts = formatter.formatToParts(date);
    const hour = parts.find((p) => p.type === "hour")?.value || "0";
    return parseInt(hour, 10);
  }


  /**
   * Set time to 23:59:59 for a given date in user's timezone and convert to UTC
   * Example: 2026-02-05T03:01:30.023 -> 2026-02-06T07:59:59.000Z (for PST user)
   * Returns ISO string in UTC
   */
  endOfDay(dateString?: string): string {
    let date: Date;

    if (dateString) {
      date = new Date(dateString);
    } else {
      date = new Date();
    }

    // Get the date parts in user's timezone
    const dateFormatter = new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      timeZone: this.timezone,
    });

    const parts = dateFormatter.formatToParts(date);
    const userYear = parseInt(parts.find((p) => p.type === "year")?.value || "2026");
    const userMonth = parseInt(parts.find((p) => p.type === "month")?.value || "01");
    const userDay = parseInt(parts.find((p) => p.type === "day")?.value || "01");

    // Create UTC dates for the start of user's day and next day
    const userDayStart = new Date(`${userYear}-${String(userMonth).padStart(2, "0")}-${String(userDay).padStart(2, "0")}T00:00:00Z`);
    const userDayNext = new Date(userDayStart);
    userDayNext.setUTCDate(userDayNext.getUTCDate() + 1);

    // Get what time the START of the CURRENT day shows in user's timezone (to calc offset)
    const formatter = new Intl.DateTimeFormat("en-US", {
      hour: "2-digit",
      hour12: false,
      minute: "2-digit",
      second: "2-digit",
      timeZone: this.timezone,
    });

    const currentDayUserTime = formatter.formatToParts(userDayStart);
    const currentDayHourInUserTz = parseInt(currentDayUserTime.find((p) => p.type === "hour")?.value || "0");

    // Debug log
    console.log(`[getEndOfDayUTC] userDay=${userDay}, currentDayHourInUserTz=${currentDayHourInUserTz}, userDayStart=${userDayStart.toISOString()}, userDayNext=${userDayNext.toISOString()}`);

    // The offset: if Feb 5 00:00:00 UTC = 16:00:00 PST, then UTC is 16 hours ahead of user tz
    // To get end of user day (23:59:59 PST on Feb 5):
    // From Feb 6 00:00:00 UTC, we need to ADD (24 - offsetHours) hours, minus 1 second
    // = Feb 6 00:00:00 UTC + 8 hours - 1 second = Feb 6 07:59:59 UTC

    const hoursToAddFromNextDay = 24 - currentDayHourInUserTz;
    const secondsToAdd = (hoursToAddFromNextDay * 3600) - 1;

    console.log(`[getEndOfDayUTC] hoursToAddFromNextDay=${hoursToAddFromNextDay}, secondsToAdd=${secondsToAdd}`);

    const result = new Date(userDayNext);
    result.setUTCSeconds(result.getUTCSeconds() + secondsToAdd);

    return result.toISOString();
  }

}
