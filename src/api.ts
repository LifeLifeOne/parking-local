import { invoke, isTauri } from "@tauri-apps/api/core";
import { confirm, open, save } from "@tauri-apps/plugin-dialog";
export const desktop = isTauri();
export async function command<T>(
  name: string,
  args?: Record<string, unknown>,
): Promise<T> {
  if (!desktop)
    throw new Error(
      "Ouvrez Parking local depuis son raccourci pour accéder à vos données.",
    );
  return invoke<T>(name, args);
}
export const ask = (message: string) =>
  desktop
    ? confirm(message, {
        title: "Parking local",
        kind: "warning",
        okLabel: "Confirmer",
        cancelLabel: "Revenir",
      })
    : Promise.resolve(window.confirm(message));
export const pickFolder = () =>
  open({
    directory: true,
    multiple: false,
    title: "Choisir le dossier de sauvegarde externe",
  });
export const pickBackup = () =>
  open({
    multiple: false,
    title: "Choisir une sauvegarde Parking local",
    filters: [{ name: "Sauvegarde SQLite", extensions: ["sqlite"] }],
  });
export const pickPdf = (date: string) =>
  save({
    title: "Enregistrer la feuille du jour",
    defaultPath: `Parking-${date}.pdf`,
    filters: [{ name: "PDF", extensions: ["pdf"] }],
  });
