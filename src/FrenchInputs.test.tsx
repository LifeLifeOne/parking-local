// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import {
  FrenchDateInput,
  FrenchTimeInput,
  parseFrenchDate,
  parseFrenchTime,
} from "./FrenchInputs";
afterEach(cleanup);
describe("dates et heures françaises", () => {
  it("valide le calendrier français et refuse les dates impossibles", () => {
    expect(parseFrenchDate("02/10/2026")).toBe("2026-10-02");
    expect(parseFrenchDate("02102026")).toBe("2026-10-02");
    expect(parseFrenchDate("31/02/2026")).toBeNull();
    expect(parseFrenchDate("29/02/2028")).toBe("2028-02-29");
    expect(parseFrenchDate("10/31/2026")).toBeNull();
  });
  it("utilise des heures sur 24 h", () => {
    expect(parseFrenchTime("18:30")).toBe("18:30");
    expect(parseFrenchTime("1830")).toBe("18:30");
    expect(parseFrenchTime("8:05")).toBe("08:05");
    expect(parseFrenchTime("24:00")).toBeNull();
    expect(parseFrenchTime("6:30 PM")).toBeNull();
  });
  it("affiche JJ/MM/AAAA et conserve la saisie partielle", () => {
    const change = vi.fn();
    const { rerender } = render(
      <FrenchDateInput
        ariaLabel="Date"
        value="2026-10-02"
        required
        onChange={change}
      />,
    );
    const input = screen.getByLabelText("Date") as HTMLInputElement;
    expect(input.type).toBe("text");
    expect(input.value).toBe("02/10/2026");
    fireEvent.change(input, { target: { value: "03/" } });
    rerender(
      <FrenchDateInput ariaLabel="Date" value="" required onChange={change} />,
    );
    expect(input.value).toBe("03/");
    expect(input.checkValidity()).toBe(false);
    fireEvent.change(input, { target: { value: "03/10/2026" } });
    expect(change).toHaveBeenLastCalledWith("2026-10-03");
    expect(input.checkValidity()).toBe(true);
  });
  it("n’utilise pas le sélecteur AM/PM du système", () => {
    const change = vi.fn();
    render(
      <FrenchTimeInput ariaLabel="Heure" value="18:30" onChange={change} />,
    );
    const input = screen.getByLabelText("Heure") as HTMLInputElement;
    expect(input.type).toBe("text");
    expect(input.value).toBe("18:30");
    fireEvent.change(input, { target: { value: "1960" } });
    expect(input.checkValidity()).toBe(false);
    fireEvent.change(input, { target: { value: "1905" } });
    fireEvent.blur(input);
    expect(input.value).toBe("19:05");
    expect(change).toHaveBeenLastCalledWith("19:05");
  });
});
