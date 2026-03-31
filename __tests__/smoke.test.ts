import { evaluate } from "mathjs";
import { getSupportedTimeZones } from "@/lib/timezones";

describe("project smoke", () => {
  it("resolves time zone list with at least one entry", () => {
    const zones = getSupportedTimeZones();
    expect(zones.length).toBeGreaterThan(0);
  });

  it("evaluates math.js expressions", () => {
    expect(evaluate("2 + 2")).toBe(4);
  });
});
