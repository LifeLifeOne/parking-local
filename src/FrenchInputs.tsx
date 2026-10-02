import { useEffect, useRef, useState } from "react";
export function formatFrenchDate(iso: string): string {
  const parts = iso.split("-");
  return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : iso;
}
export function parseFrenchDate(text: string): string | null {
  const trimmed = text.trim();
  const parts =
    /^(\d{2})[/.](\d{2})[/.](\d{4})$/.exec(trimmed) ??
    /^(\d{2})(\d{2})(\d{4})$/.exec(trimmed);
  if (!parts) return null;
  const [, day, month, year] = parts;
  if (Number(year) < 1) return null;
  const iso = `${year}-${month}-${day}`,
    value = new Date(iso + "T12:00:00Z");
  return Number.isFinite(value.getTime()) &&
    value.toISOString().slice(0, 10) === iso
    ? iso
    : null;
}
export function parseFrenchTime(text: string): string | null {
  const match =
    /^(\d{1,2}):(\d{2})$/.exec(text.trim()) ??
    /^(\d{2})(\d{2})$/.exec(text.trim());
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) return null;
  return `${match[1].padStart(2, "0")}:${match[2]}`;
}
export function formatTimeDraft(text: string): string {
  const value = text.trim();
  if (/^\d{3,4}$/.test(value)) return `${value.slice(0, 2)}:${value.slice(2)}`;
  return parseFrenchTime(value) ?? text;
}
interface Props {
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  ariaLabel?: string;
}
export function FrenchDateInput({
  value,
  onChange,
  required,
  ariaLabel,
}: Props) {
  const [draft, setDraft] = useState(() => formatFrenchDate(value));
  const emitted = useRef(value),
    input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (value !== emitted.current) {
      emitted.current = value;
      setDraft(formatFrenchDate(value));
      input.current?.setCustomValidity("");
    }
  }, [value]);
  return (
    <input
      ref={input}
      type="text"
      lang="fr"
      inputMode="numeric"
      required={required}
      aria-label={ariaLabel}
      placeholder="JJ/MM/AAAA"
      maxLength={10}
      value={draft}
      onChange={(e) => {
        const text = e.target.value;
        setDraft(text);
        const iso = parseFrenchDate(text);
        e.target.setCustomValidity(
          text && !iso ? "Saisissez une date valide au format JJ/MM/AAAA." : "",
        );
        emitted.current = iso ?? "";
        onChange(emitted.current);
      }}
      onBlur={() => {
        const iso = parseFrenchDate(draft);
        if (iso) setDraft(formatFrenchDate(iso));
      }}
    />
  );
}
export function FrenchTimeInput({ value, onChange, ariaLabel }: Props) {
  const [draft, setDraft] = useState(value),
    emitted = useRef(value),
    input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (value !== emitted.current) {
      emitted.current = value;
      setDraft(value);
      input.current?.setCustomValidity("");
    }
  }, [value]);
  return (
    <input
      ref={input}
      type="text"
      lang="fr"
      inputMode="numeric"
      aria-label={ariaLabel}
      placeholder="HH:mm — ex. 18:30"
      maxLength={5}
      value={draft}
      onChange={(e) => {
        const text = formatTimeDraft(e.target.value);
        setDraft(text);
        const time = parseFrenchTime(text);
        e.target.setCustomValidity(
          text && !time
            ? "Saisissez une heure de 00:00 à 23:59, au format HH:mm."
            : "",
        );
        emitted.current = time ?? text;
        onChange(emitted.current);
      }}
      onBlur={() => {
        const time = parseFrenchTime(draft);
        if (time) setDraft(time);
      }}
    />
  );
}
