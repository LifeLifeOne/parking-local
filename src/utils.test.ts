import { describe, it, expect } from "vitest";
import {
  cents,
  newBooking,
  matches,
  addDays,
  monday,
  localDate,
  overdue,
  peakForDay,
} from "./utils";
describe("saisie et affichage français", () => {
  it("conserve exactement les centimes", () => {
    expect(cents("125,50")).toBe(12550);
    expect(cents("0.29")).toBe(29);
    expect(cents("12")).toBe(1200);
    for (const v of ["-1", "1,234", "1e2", ""])
      expect(() => cents(v)).toThrow();
  });
  it("recherche accents, téléphone et plaque", () => {
    const b = {
      ...newBooking("2030-01-01"),
      name: "Élodie Martin",
      phone: "06 12 34",
      plate: "AB-123-CD",
    };
    expect(matches(b, "elodie")).toBe(true);
    expect(matches(b, "ab123cd")).toBe(true);
    expect(matches(b, "061234")).toBe(true);
  });
  it("gère les frontières de mois et le fuseau de Paris", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(monday("2026-10-04")).toBe("2026-09-28");
    expect(localDate(Date.parse("2026-10-01T23:00:00Z"))).toBe("2026-10-02");
  });
  it("signale le dépassement sans heure après la fin du jour", () => {
    const b = {
      ...newBooking("2026-10-01"),
      status: "active" as const,
      end_date: "2026-10-02",
    };
    expect(overdue(b, Date.parse("2026-10-02T12:00:00Z") / 1000)).toBe(false);
    expect(overdue(b, Date.parse("2026-10-02T23:00:00Z") / 1000)).toBe(true);
  });
  it("ne compte pas la fin exclusive dans la journée suivante", () => {
    const periods = [
      {
        start: Date.parse("2026-10-01T22:00:00Z") / 1000,
        end: Date.parse("2026-10-02T22:00:00Z") / 1000,
        occupied: 2,
        remaining: 3,
      },
    ];
    expect(peakForDay(periods, "2026-10-02")).toBe(2);
    expect(peakForDay(periods, "2026-10-03")).toBe(0);
  });
});
