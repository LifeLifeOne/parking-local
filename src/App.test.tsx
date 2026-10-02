// @vitest-environment jsdom
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import {
  render,
  screen,
  cleanup,
  fireEvent,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";
import { newBooking } from "./utils";
import type { Snapshot } from "./types";
const api = vi.hoisted(() => ({
  command: vi.fn(),
  ask: vi.fn(),
  pickPdf: vi.fn(),
  pickBackup: vi.fn(),
  pickFolder: vi.fn(),
}));
vi.mock("./api", () => ({ ...api, desktop: false }));
const existing = {
  ...newBooking("2026-10-02"),
  id: 1,
  client_id: 1,
  name: "Élodie Martin",
  phone: "06 12 34 56 78",
  vehicle: "Renault Clio",
  plate: "AB-123-CD",
  start_time: "09:00",
  end_date: "2026-10-05",
  amount_cents: 12550,
};
let snapshot: Snapshot;
beforeEach(() => {
  snapshot = {
    bookings: [existing],
    clients: [{ id: 1, name: existing.name, phone: existing.phone }],
    settings: { capacity: 20, external_folder: null },
    backup: { local: null, external: null, error: null },
    today: "2026-10-02",
    now: Date.parse("2026-10-02T08:00:00Z") / 1000,
  };
  api.command.mockReset();
  api.ask.mockReset();
  api.ask.mockResolvedValue(true);
  api.command.mockImplementation(async (name) =>
    name === "snapshot"
      ? snapshot
      : name === "day"
        ? [
            {
              booking_id: 1,
              client_id: 1,
              name: existing.name,
              phone: existing.phone,
              vehicle: existing.vehicle,
              plate: existing.plate,
              time: "09:00",
              action: "Dépôt au parking",
              notes: "",
            },
          ]
        : name === "occupancy"
          ? { available: true, periods: [], minimum_remaining: 20 }
          : undefined,
  );
});
afterEach(cleanup);
describe("parcours du gestionnaire", () => {
  it("ouvre le rendez-vous puis retrouve les coordonnées et centimes", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(
      await screen.findByRole("button", { name: /Dépôt au parking/ }),
    );
    expect(
      (screen.getByLabelText("Nom du client") as HTMLInputElement).value,
    ).toBe("Élodie Martin");
    expect(
      (screen.getByLabelText("Montant convenu (€)") as HTMLInputElement).value,
    ).toBe("125,50");
    expect((screen.getByLabelText("Téléphone") as HTMLInputElement).value).toBe(
      existing.phone,
    );
  });
  it("demande avant d’abandonner un formulaire modifié", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(
      await screen.findByRole("button", { name: /Nouvelle réservation/ }),
    );
    await user.type(screen.getByLabelText("Nom du client"), "Paul");
    api.ask.mockResolvedValue(false);
    await user.click(screen.getByRole("button", { name: "Planning" }));
    expect(api.ask).toHaveBeenCalled();
    expect(screen.getByLabelText("Nom du client")).toBeTruthy();
    api.ask.mockResolvedValue(true);
    await user.click(screen.getByRole("button", { name: "Planning" }));
    await screen.findByRole("heading", { name: "Le planning" });
  });
  it("enregistre un transfert indépendamment des heures de parking", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(
      await screen.findByRole("button", { name: /Dépôt au parking/ }),
    );
    await user.click(screen.getByLabelText("Récupération au retour"));
    fireEvent.change(screen.getByLabelText("Heure (facultative)"), {
      target: { value: "11:30" },
    });
    await user.click(
      screen.getByRole("button", { name: "Enregistrer le séjour" }),
    );
    await waitFor(() =>
      expect(api.command).toHaveBeenCalledWith("save_booking", {
        booking: {
          ...existing,
          transfers: [
            { kind: "return", date: "2026-10-05", time: "11:30", notes: "" },
          ],
        },
      }),
    );
  });
  it("conserve la saisie si le moteur refuse pour capacité", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(
      await screen.findByRole("button", { name: /Dépôt au parking/ }),
    );
    api.command.mockImplementation(async (name) => {
      if (name === "save_booking")
        throw "Capacité dépassée : 1 place manquante";
      if (name === "snapshot") return snapshot;
      return [];
    });
    await user.click(
      screen.getByRole("button", { name: "Enregistrer le séjour" }),
    );
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Capacité dépassée",
    );
    expect(
      (screen.getByLabelText("Immatriculation") as HTMLInputElement).value,
    ).toBe("AB-123-CD");
  });
  it("refuse une saisie monétaire avec trois décimales", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(
      await screen.findByRole("button", { name: /Dépôt au parking/ }),
    );
    fireEvent.change(screen.getByLabelText("Montant convenu (€)"), {
      target: { value: "12,345" },
    });
    await user.click(
      screen.getByRole("button", { name: "Enregistrer le séjour" }),
    );
    expect((await screen.findByRole("alert")).textContent).toContain(
      "deux décimales",
    );
    expect(
      api.command.mock.calls.some(([name]) => name === "save_booking"),
    ).toBe(false);
  });
});
