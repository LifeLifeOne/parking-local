import type { Booking, Status, Period } from "./types";
export const statuses: Record<Status, string> = {
  option: "Option",
  confirmed: "Confirmée",
  active: "En cours",
  completed: "Terminée",
  cancelled: "Annulée",
};
export const frenchDate = (
  day: string,
  options: Intl.DateTimeFormatOptions = {
    day: "numeric",
    month: "long",
    year: "numeric",
  },
) =>
  new Date(day + "T12:00:00Z").toLocaleDateString("fr-FR", {
    ...options,
    timeZone: "Europe/Paris",
  });
export const localDate = (ms = Date.now()) =>
  new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(ms);
export const moment = (seconds: number) =>
  new Date(seconds * 1000).toLocaleString("fr-FR", {
    timeZone: "Europe/Paris",
    dateStyle: "short",
    timeStyle: "short",
  });
export const addDays = (day: string, n: number) => {
  const d = new Date(day + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
export const monday = (day: string) =>
  addDays(day, -((new Date(day + "T12:00:00Z").getUTCDay() + 6) % 7));
export const euros = (cents: number) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(
    cents / 100,
  );
export function cents(text: string): number {
  if (!/^\d{1,7}([,.]\d{1,2})?$/.test(text.trim()))
    throw new Error(
      "Saisissez un montant positif avec au plus deux décimales.",
    );
  const [whole, decimal = ""] = text.trim().replace(",", ".").split(".");
  return Number(whole) * 100 + Number(decimal.padEnd(2, "0"));
}
export function newBooking(day: string): Booking {
  return {
    id: null,
    client_id: null,
    name: "",
    phone: "",
    vehicle: "",
    plate: "",
    start_date: day,
    start_time: null,
    end_date: addDays(day, 1),
    end_time: null,
    notes: "",
    flight: "",
    amount_cents: 0,
    paid: false,
    status: "confirmed",
    actual_in: null,
    actual_out: null,
    transfers: [],
  };
}
export const overdue = (b: Booking, now: number) =>
  b.status === "active" &&
  (b.end_time
    ? localDate(now * 1000) > b.end_date ||
      (localDate(now * 1000) === b.end_date &&
        new Date(now * 1000).toLocaleTimeString("fr-FR", {
          timeZone: "Europe/Paris",
          hour: "2-digit",
          minute: "2-digit",
        }) >= b.end_time)
    : localDate(now * 1000) > b.end_date);
export const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("fr-FR")
    .replace(/[\s-]/g, "");
export const matches = (b: Booking, query: string) =>
  normalize(
    [
      b.name,
      b.phone,
      b.vehicle,
      b.plate,
      b.flight,
      b.notes,
      b.start_date,
      b.end_date,
    ].join(" "),
  ).includes(normalize(query));
export function peakForDay(periods: Period[], day: string): number {
  return Math.max(
    0,
    ...periods
      .filter(
        (p) =>
          localDate(p.start * 1000) <= day &&
          localDate((p.end - 1) * 1000) >= day,
      )
      .map((p) => p.occupied),
  );
}
export function staysOn(b: Booking, day: string, now: number): boolean {
  if (b.status === "cancelled") return false;
  if (b.status === "completed" && b.actual_in && b.actual_out)
    return (
      localDate(b.actual_in * 1000) <= day &&
      localDate((b.actual_out - 1) * 1000) >= day
    );
  const start = b.actual_in ? localDate(b.actual_in * 1000) : b.start_date;
  return start <= day && (overdue(b, now) || b.end_date >= day);
}
