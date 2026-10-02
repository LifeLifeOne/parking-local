import NavIcon from "./NavIcon";
import { FrenchDateInput, FrenchTimeInput } from "./FrenchInputs";
import { useCallback, useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { command, ask, desktop, pickFolder, pickBackup, pickPdf } from "./api";
import type {
  Appointment,
  Availability,
  Booking,
  Snapshot,
  Settings,
  Transfer,
} from "./types";
import {
  addDays,
  cents,
  euros,
  frenchDate,
  localDate,
  matches,
  moment,
  monday,
  newBooking,
  overdue,
  peakForDay,
  statuses,
  staysOn,
} from "./utils";
type Tab = "today" | "planning" | "search" | "settings";
export default function App() {
  const [data, setData] = useState<Snapshot | null>(null),
    [tab, setTab] = useState<Tab>("today"),
    [date, setDate] = useState(localDate()),
    [events, setEvents] = useState<Appointment[]>([]),
    [editor, setEditor] = useState<Booking | null>(null),
    [saved, setSaved] = useState(""),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const [installAvailable, setInstallAvailable] = useState(false);
  useEffect(() => {
    if (desktop)
      command<boolean>("install_available")
        .then(setInstallAvailable)
        .catch(() => {});
  }, []);
  const [editorSession, setEditorSession] = useState(0);
  const dirty = useRef(false);
  dirty.current = editor !== null && JSON.stringify(editor) !== saved;
  const reload = useCallback(async () => {
    const result = await command<Snapshot>("snapshot");
    setData(result);
  }, []);
  useEffect(() => {
    reload().catch((e) => setError(String(e)));
    if (!desktop) return;
    const timer = setInterval(
      () => reload().catch((e) => setError(String(e))),
      5000,
    );
    return () => clearInterval(timer);
  }, [reload]);
  useEffect(() => {
    let valid = true;
    if (!data) return;
    command<Appointment[]>("day", { date })
      .then((v) => {
        if (valid) setEvents(v);
      })
      .catch((e) => setError(String(e)));
    return () => {
      valid = false;
    };
  }, [date, data]);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    let cleanup: (() => void) | undefined;
    let disposed = false;
    if (desktop)
      getCurrentWindow()
        .onCloseRequested(async (e) => {
          if (dirty.current) {
            e.preventDefault();
            if (
              await ask(
                "Cette réservation contient des modifications non enregistrées. Quitter sans enregistrer ?",
              )
            ) {
              dirty.current = false;
              await getCurrentWindow().destroy();
            }
          }
        })
        .then((fn) => {
          if (disposed) fn();
          else cleanup = fn;
        });
    return () => {
      disposed = true;
      cleanup?.();
      window.removeEventListener("beforeunload", warn);
    };
  }, []);
  const run = async (fn: () => Promise<unknown>, message = "") => {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await fn();
      await reload();
      if (result !== false) setNotice(message);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };
  const leave = async () =>
    !dirty.current ||
    (await ask("Des modifications ne sont pas enregistrées. Les abandonner ?"));
  const navigate = async (next: Tab) => {
    if (busy) return;
    if (await leave()) {
      setEditor(null);
      setTab(next);
      setError("");
    }
  };
  const edit = async (b?: Booking) => {
    if (busy) return;
    if (await leave()) {
      const next = structuredClone(b ?? newBooking(data?.today ?? localDate()));
      setEditorSession((v) => v + 1);
      setEditor(next);
      setSaved(JSON.stringify(next));
      setError("");
      setNotice("");
    }
  };
  const close = async () => {
    if (busy) return;
    if (await leave()) setEditor(null);
  };
  const presence = (b: Booking, arriving: boolean) =>
    run(async () => {
      if (
        await ask(
          arriving
            ? `Enregistrer l’arrivée réelle de ${b.name} au parking ?`
            : `Enregistrer la sortie réelle de ${b.name} et libérer sa place ?`,
        )
      ) {
        await command("presence", { id: b.id, arriving });
      } else return false;
    }, "Présence mise à jour.");
  const pdf = () =>
    run(async () => {
      const path = await pickPdf(date);
      if (path) await command("export_pdf", { date, path });
      else return false;
    }, "Feuille du jour enregistrée.");
  const cancelled =
    data?.bookings.filter(
      (b) => b.status === "active" && overdue(b, data.now),
    ) ?? [];
  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-icon">P</span>
          <div>
            Parking local<small>Votre parking, simplement</small>
          </div>
        </div>
        <nav aria-label="Navigation principale">
          {(
            [
              ["today", "Aujourd’hui"],
              ["planning", "Planning"],
              ["search", "Clients & séjours"],
              ["settings", "Réglages"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              className={tab === id ? "selected" : ""}
              onClick={() => void navigate(id)}
            >
              <span aria-hidden="true">
                <NavIcon section={id} />
              </span>
              {label}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <span className="offline-dot" /> Fonctionne hors ligne
          <small>Données privées sur cet ordinateur</small>
        </div>
      </aside>
      <main>
        <header className="topbar">
          <div>
            <span className="eyebrow">UN PARKING BIEN ORGANISÉ</span>
            <h1>
              {editor
                ? editor.id
                  ? "Modifier le séjour"
                  : "Nouvelle réservation"
                : {
                    today: "Aujourd’hui",
                    planning: "Le planning",
                    search: "Clients & séjours",
                    settings: "Réglages",
                  }[tab]}
            </h1>
          </div>
          <button
            className="primary"
            disabled={!data || busy}
            onClick={() => void edit()}
          >
            ＋ Nouvelle réservation
          </button>
        </header>
        {installAvailable && (
          <div className="alert success">
            <strong>Installer Parking local sur cet ordinateur</strong>
            <span>
              {" "}
              Ajoutez l’application à votre lanceur pour la retrouver
              facilement.
            </span>
            <button
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await command("install_linux");
                  setInstallAvailable(false);
                }, "Application installée. Retrouvez Parking local dans votre lanceur.")
              }
            >
              Installer dans mon compte
            </button>
          </div>
        )}
        {error && (
          <div className="alert error" role="alert">
            {error}
            <button aria-label="Fermer le message" onClick={() => setError("")}>
              ×
            </button>
          </div>
        )}
        {notice && (
          <div className="alert success" role="status">
            {notice}
          </div>
        )}
        {!data ? (
          <section className="panel empty">
            <h2>
              {desktop ? "Ouverture du parking…" : "Application de bureau"}
            </h2>
            <p>
              {desktop
                ? "Lecture des données locales."
                : "Cette interface doit être ouverte avec l’application Parking local. Les données sont gérées par le moteur SQLite local."}
            </p>
            <button
              onClick={() => void reload().catch((e) => setError(String(e)))}
            >
              Réessayer
            </button>
          </section>
        ) : editor ? (
          <BookingEditor
            key={editorSession}
            booking={editor}
            setBooking={setEditor}
            data={data}
            busy={busy}
            close={close}
            save={() =>
              run(async () => {
                await command("save_booking", { booking: editor });
                setEditor(null);
                dirty.current = false;
              }, "Réservation enregistrée.")
            }
            onError={setError}
          />
        ) : (
          <>
            {data.backup.error && (
              <div className="alert warning" role="status">
                Sauvegarde : {data.backup.error}
              </div>
            )}
            {cancelled.length > 0 && (
              <div className="alert warning">
                <strong>
                  {cancelled.length} voiture(s) encore présente(s) après le
                  retrait prévu.
                </strong>
                <span>
                  {" "}
                  Elles continuent d’occuper une place jusqu’à leur sortie
                  réelle.
                </span>
                <button onClick={() => void edit(cancelled[0])}>
                  Voir le séjour
                </button>
              </div>
            )}
            {tab === "today" && (
              <>
                <div className="toolbar">
                  <label className="date-label">
                    Feuille du{" "}
                    <FrenchDateInput
                      value={date}
                      onChange={(value) => value && setDate(value)}
                    />
                  </label>
                  <div>
                    <button onClick={() => setDate(data.today)}>
                      Revenir à aujourd’hui
                    </button>
                    <button disabled={busy} onClick={() => void pdf()}>
                      Exporter la feuille en PDF
                    </button>
                  </div>
                </div>
                <div className="stats">
                  <Stat value={events.length} label="rendez-vous" />
                  <Stat
                    value={new Set(events.map((e) => e.client_id)).size}
                    label="clients distincts"
                  />
                  <Stat
                    value={
                      data.bookings.filter((b) => b.status === "active").length
                    }
                    label="voitures présentes"
                  />
                  <Stat
                    value={
                      events.filter((e) => e.action === "Dépôt au parking")
                        .length +
                      " / " +
                      events.filter((e) => e.action === "Retrait au parking")
                        .length
                    }
                    label="entrées / sorties prévues"
                  />
                </div>
                <section className="panel">
                  <div className="section-title">
                    <div>
                      <h2>Les rendez-vous</h2>
                      <p>
                        {frenchDate(date, {
                          weekday: "long",
                          day: "numeric",
                          month: "long",
                          year: "numeric",
                        })}
                      </p>
                    </div>
                    <span className="badge">Horaires de Paris</span>
                  </div>
                  <EventList
                    events={events.filter((e) => e.time)}
                    bookings={data.bookings}
                    edit={edit}
                  />
                </section>
                <section className="panel">
                  <h2>Horaires à préciser</h2>
                  <EventList
                    events={events.filter((e) => !e.time)}
                    bookings={data.bookings}
                    edit={edit}
                  />
                </section>
                <section className="panel">
                  <h2>Voitures présentes au parking</h2>
                  <p>
                    La présence est enregistrée avec les boutons d’arrivée et de
                    sortie.
                  </p>
                  <BookingList
                    bookings={data.bookings.filter(
                      (b) => b.status === "active",
                    )}
                    edit={edit}
                    presence={presence}
                    busy={busy}
                    now={data.now}
                  />
                </section>
              </>
            )}
            {tab === "planning" && (
              <Planning data={data} edit={edit} onError={setError} />
            )}
            {tab === "search" && (
              <Search data={data} edit={edit} presence={presence} busy={busy} />
            )}
            {tab === "settings" && (
              <SettingsPage data={data} busy={busy} run={run} />
            )}
          </>
        )}
        <footer>
          Parking local · 0.1.0{" "}
          <span>Un parking par utilisateur · Europe/Paris</span>
        </footer>
      </main>
    </div>
  );
}
function Stat({ value, label }: { value: number | string; label: string }) {
  return (
    <div className="stat">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}
function EventList({
  events,
  bookings,
  edit,
}: {
  events: Appointment[];
  bookings: Booking[];
  edit: (b: Booking) => Promise<void>;
}) {
  return events.length ? (
    <div className="event-list">
      {events.map((e, i) => (
        <button
          className="event"
          key={e.booking_id + ":" + i}
          onClick={() => {
            const b = bookings.find((b) => b.id === e.booking_id);
            if (b) void edit(b);
          }}
        >
          <span className="event-time">{e.time ?? "À préciser"}</span>
          <span className="event-action">
            {e.action}
            <small>{e.notes || "Aucune note"}</small>
          </span>
          <span className="event-client">
            <strong>{e.name}</strong>
            <small>{e.phone}</small>
          </span>
          <span className="event-car">
            {e.vehicle || "Véhicule non renseigné"}
            <small>{e.plate || "Plaque non renseignée"}</small>
          </span>
          <span aria-hidden="true">→</span>
        </button>
      ))}
    </div>
  ) : (
    <div className="empty small">Aucun rendez-vous dans cette catégorie.</div>
  );
}
function BookingList({
  bookings,
  edit,
  presence,
  busy,
  now,
}: {
  bookings: Booking[];
  edit: (b: Booking) => Promise<void>;
  presence: (b: Booking, arriving: boolean) => Promise<void>;
  busy: boolean;
  now: number;
}) {
  return bookings.length ? (
    <div className="booking-list">
      {bookings.map((b) => (
        <article className="booking-row" key={b.id}>
          <button className="booking-details" onClick={() => void edit(b)}>
            <strong>{b.name}</strong>
            <span>
              {[b.vehicle, b.plate, b.phone].filter(Boolean).join(" · ")}
            </span>
            <small>
              {frenchDate(b.start_date)} {b.start_time ?? "horaire à préciser"}{" "}
              → {frenchDate(b.end_date)} {b.end_time ?? "horaire à préciser"}
            </small>
          </button>
          <div className="row-status">
            <span className={"badge status-" + b.status}>
              {statuses[b.status]}
            </span>
            <small>
              {euros(b.amount_cents)} · {b.paid ? "Payé" : "Non payé"}
            </small>
            {overdue(b, now) && (
              <strong className="late">Retrait dépassé</strong>
            )}
          </div>
          {["confirmed", "option"].includes(b.status) && (
            <button disabled={busy} onClick={() => void presence(b, true)}>
              Enregistrer l’arrivée
            </button>
          )}
          {b.status === "active" && (
            <button disabled={busy} onClick={() => void presence(b, false)}>
              Enregistrer la sortie
            </button>
          )}
        </article>
      ))}
    </div>
  ) : (
    <div className="empty small">Aucun séjour à afficher.</div>
  );
}
function BookingEditor({
  booking: b,
  setBooking,
  data,
  busy,
  close,
  save,
  onError,
}: {
  booking: Booking;
  setBooking: (b: Booking) => void;
  data: Snapshot;
  busy: boolean;
  close: () => Promise<void>;
  save: () => Promise<void>;
  onError: (e: string) => void;
}) {
  const [amount, setAmount] = useState(
      (b.amount_cents / 100).toFixed(2).replace(".", ","),
    ),
    [availability, setAvailability] = useState<Availability | null>(null),
    [checking, setChecking] = useState(false);
  useEffect(
    () => setAvailability(null),
    [b.start_date, b.start_time, b.end_date, b.end_time, b.id],
  );
  const patch = (v: Partial<Booking>) => setBooking({ ...b, ...v });
  const field = (
    key: "name" | "phone" | "vehicle" | "plate" | "flight",
    label: string,
    required = false,
  ) => (
    <label>
      {label}
      <input
        required={required}
        value={b[key]}
        onChange={(e) => patch({ [key]: e.target.value })}
      />
    </label>
  );
  const transfer = (kind: Transfer["kind"], label: string) => {
    const current = b.transfers.find((t) => t.kind === kind);
    const update = (v: Partial<Transfer>) =>
      patch({
        transfers: b.transfers.map((t) =>
          t.kind === kind ? { ...t, ...v } : t,
        ),
      });
    return (
      <div className="transfer">
        <label className="check">
          <input
            type="checkbox"
            checked={!!current}
            onChange={(e) =>
              patch({
                transfers: e.target.checked
                  ? [
                      ...b.transfers,
                      {
                        kind,
                        date: kind === "outbound" ? b.start_date : b.end_date,
                        time: null,
                        notes: "",
                      },
                    ]
                  : b.transfers.filter((t) => t.kind !== kind),
              })
            }
          />
          {label}
        </label>
        {current && (
          <div className="form-grid">
            <label>
              Date
              <FrenchDateInput
                required

                value={current.date}
                onChange={(value) => update({ date: value })}
              />
            </label>
            <label>
              Heure (24 h, facultative)
              <FrenchTimeInput
                value={current.time ?? ""}
                onChange={(value) => update({ time: value || null })}
              />
            </label>
            <label className="full">
              Notes du transfert
              <textarea
                value={current.notes}
                onChange={(e) => update({ notes: e.target.value })}
              />
            </label>
          </div>
        )}
      </div>
    );
  };
  const check = async () => {
    setChecking(true);
    try {
      setAvailability(
        await command<Availability>("availability", { booking: b }),
      );
    } catch (e) {
      onError(String(e));
    } finally {
      setChecking(false);
    }
  };
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        try {
          cents(amount);
          void save();
        } catch (e) {
          onError(String(e));
        }
      }}
    >
      <div className="editor-columns">
        <div>
          <section className="panel">
            <h2>Le client et son véhicule</h2>
            <div className="form-grid">
              <label className="full">
                Client habituel
                <select
                  value={b.client_id ?? ""}
                  onChange={(e) => {
                    const c = data.clients.find(
                      (c) => c.id === Number(e.target.value),
                    );
                    patch(
                      c
                        ? { client_id: c.id, name: c.name, phone: c.phone }
                        : { client_id: null, name: "", phone: "" },
                    );
                  }}
                >
                  <option value="">Créer un nouveau client</option>
                  {data.clients.map((c) => (
                    <option value={c.id} key={c.id}>
                      {c.name} · {c.phone}
                    </option>
                  ))}
                </select>
              </label>
              {field("name", "Nom du client", true)}
              {field("phone", "Téléphone", true)}
              {field("vehicle", "Véhicule (facultatif : marque, modèle)")}
              {field("plate", "Immatriculation (facultative)")}
            </div>
            {b.client_id && (
              <p className="hint">
                Les coordonnées modifiées seront réutilisées pour ce client.
              </p>
            )}
          </section>
          <section className="panel">
            <h2>Occupation du parking</h2>
            <p>Sans heure, toute la journée est réservée par prudence.</p>
            <div className="form-grid">
              <label>
                Date de dépôt (JJ/MM/AAAA)
                <FrenchDateInput
                  required

                  value={b.start_date}
                  onChange={(value) => patch({ start_date: value })}
                />
              </label>
              <label>
                Heure de dépôt (24 h)
                <FrenchTimeInput
                  value={b.start_time ?? ""}
                  onChange={(value) => patch({ start_time: value || null })}
                />
              </label>
              <label>
                Date de retrait (JJ/MM/AAAA)
                <FrenchDateInput
                  required

                  value={b.end_date}
                  onChange={(value) => patch({ end_date: value })}
                />
              </label>
              <label>
                Heure de retrait (24 h)
                <FrenchTimeInput
                  value={b.end_time ?? ""}
                  onChange={(value) => patch({ end_time: value || null })}
                />
              </label>
            </div>
            <button
              type="button"
              disabled={checking}
              onClick={() => void check()}
            >
              {checking ? "Vérification…" : "Vérifier la disponibilité"}
            </button>
            {availability && (
              <div
                className={
                  "alert " + (availability.available ? "success" : "error")
                }
                role="status"
              >
                {availability.available
                  ? `Disponible : ${availability.minimum_remaining} place(s) restante(s) après cette réservation.`
                  : "Capacité insuffisante."}
                {!availability.available && (
                  <ul>
                    {availability.periods
                      .filter((p) => p.remaining < 0)
                      .map((p) => (
                        <li key={p.start}>
                          {moment(p.start)} → {moment(p.end)} : {-p.remaining}{" "}
                          place(s) manquante(s)
                        </li>
                      ))}
                  </ul>
                )}
              </div>
            )}
          </section>
          <section className="panel">
            <h2>Transferts à l’aéroport</h2>
            <p>
              Ces rendez-vous sont indépendants du dépôt et du retrait au
              parking.
            </p>
            {transfer("outbound", "Accompagnement vers l’aéroport")}
            {transfer("return", "Récupération au retour")}
          </section>
        </div>
        <div>
          <section className="panel">
            <h2>Suivi du séjour</h2>
            <label>
              Statut
              <select
                value={b.status}
                disabled={["active", "completed"].includes(b.status)}
                onChange={(e) =>
                  patch({ status: e.target.value as Booking["status"] })
                }
              >
                <option value="option">Option</option>
                <option value="confirmed">Confirmée</option>
                <option value="cancelled">Annulée</option>
                {["active", "completed"].includes(b.status) && (
                  <option value={b.status}>{statuses[b.status]}</option>
                )}
              </select>
            </label>
            <p className="hint">
              Une option réserve une place sans expiration. L’arrivée et la
              sortie sont enregistrées explicitement depuis la liste des
              séjours.
            </p>
            <label>
              Montant convenu (€)
              <input
                inputMode="decimal"
                value={amount}
                onChange={(e) => {
                  setAmount(e.target.value);
                  try {
                    patch({ amount_cents: cents(e.target.value) });
                  } catch {
                    patch({ amount_cents: -1 });
                  }
                }}
                onBlur={() => {
                  try {
                    patch({ amount_cents: cents(amount) });
                  } catch (e) {
                    onError(String(e));
                  }
                }}
              />
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={b.paid}
                onChange={(e) => patch({ paid: e.target.checked })}
              />
              Montant payé
            </label>
            {field("flight", "Numéro de vol (facultatif)")}
            <label>
              Notes
              <textarea
                rows={5}
                value={b.notes}
                onChange={(e) => patch({ notes: e.target.value })}
              />
            </label>
            {b.actual_in && <p>Arrivée réelle : {moment(b.actual_in)}</p>}
            {b.actual_out && <p>Sortie réelle : {moment(b.actual_out)}</p>}
          </section>
          <div className="editor-actions">
            <button className="primary" disabled={busy} type="submit">
              {busy ? "Enregistrement…" : "Enregistrer le séjour"}
            </button>
            <button type="button" disabled={busy} onClick={() => void close()}>
              Revenir sans enregistrer
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}
function Search({
  data,
  edit,
  presence,
  busy,
}: {
  data: Snapshot;
  edit: (b?: Booking) => Promise<void>;
  presence: (b: Booking, arriving: boolean) => Promise<void>;
  busy: boolean;
}) {
  const [query, setQuery] = useState(""),
    [status, setStatus] = useState("all");
  const bookings = data.bookings.filter(
    (b) => matches(b, query) && (status === "all" || b.status === status),
  );
  return (
    <>
      <section className="panel">
        <h2>Retrouver un séjour</h2>
        <div className="search-controls">
          <label>
            Client, téléphone, immatriculation, véhicule ou notes
            <input
              type="search"
              placeholder="Ex. Martin, AB-123-CD…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <label>
            Statut
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="all">Tous les séjours</option>
              {Object.entries(statuses).map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p>{bookings.length} séjour(s) trouvé(s), historique conservé.</p>
      </section>
      <section className="panel">
        <BookingList
          bookings={bookings}
          edit={edit}
          presence={presence}
          busy={busy}
          now={data.now}
        />
      </section>
      <section className="panel">
        <h2>Clients habituels</h2>
        <div className="client-grid">
          {data.clients
            .filter((c) =>
              matches(
                { ...newBooking(data.today), name: c.name, phone: c.phone },
                query,
              ),
            )
            .map((c) => (
              <button
                key={c.id}
                onClick={() =>
                  void edit({
                    ...newBooking(data.today),
                    client_id: c.id,
                    name: c.name,
                    phone: c.phone,
                  })
                }
              >
                <strong>{c.name}</strong>
                <small>{c.phone}</small>
                <span>Réserver un nouveau séjour →</span>
              </button>
            ))}
        </div>
        {!data.clients.length && (
          <p>Vos clients apparaîtront ici après leur première réservation.</p>
        )}
      </section>
    </>
  );
}
function Planning({
  data,
  edit,
  onError,
}: {
  data: Snapshot;
  edit: (b: Booking) => Promise<void>;
  onError: (e: string) => void;
}) {
  const [view, setView] = useState<"day" | "week" | "month">("week"),
    [date, setDate] = useState(data.today),
    [occupancy, setOccupancy] = useState<Availability | null>(null),
    [events, setEvents] = useState<Appointment[]>([]);
  const first =
    view === "month"
      ? date.slice(0, 7) + "-01"
      : view === "week"
        ? monday(date)
        : date;
  const count =
    view === "month"
      ? new Date(
          Number(date.slice(0, 4)),
          Number(date.slice(5, 7)),
          0,
        ).getDate()
      : view === "week"
        ? 7
        : 1;
  const days = Array.from({ length: count }, (_, i) => addDays(first, i));
  useEffect(() => {
    let valid = true;
    command<Availability>("occupancy", {
      start: first,
      end: addDays(first, count - 1),
    })
      .then((v) => {
        if (valid) setOccupancy(v);
      })
      .catch((e) => onError(String(e)));
    command<Appointment[]>("day", { date })
      .then((v) => {
        if (valid) setEvents(v);
      })
      .catch((e) => onError(String(e)));
    return () => {
      valid = false;
    };
  }, [first, count, date, data, onError]);
  const shift = (direction: number) => {
    if (view === "month") {
      const d = new Date(date + "T12:00:00Z");
      d.setUTCDate(1);
      d.setUTCMonth(d.getUTCMonth() + direction);
      setDate(d.toISOString().slice(0, 10));
    } else setDate(addDays(date, direction * (view === "week" ? 7 : 1)));
  };
  return (
    <>
      <div className="toolbar">
        <div className="segmented">
          {(["day", "week", "month"] as const).map((id) => (
            <button
              className={view === id ? "selected" : ""}
              key={id}
              onClick={() => setView(id)}
            >
              {{ day: "Journée", week: "Semaine", month: "Mois" }[id]}
            </button>
          ))}
        </div>
        <div>
          <button aria-label="Période précédente" onClick={() => shift(-1)}>
            ←
          </button>
          <FrenchDateInput
            ariaLabel="Date du planning"

            value={date}
            onChange={(value) => value && setDate(value)}
          />
          <button aria-label="Période suivante" onClick={() => shift(1)}>
            →
          </button>
          <button onClick={() => setDate(data.today)}>Aujourd’hui</button>
        </div>
      </div>
      <section className="panel">
        <div className="section-title">
          <h2>
            {view === "month"
              ? frenchDate(first, { month: "long", year: "numeric" })
              : `${frenchDate(first)}${view === "week" ? " — " + frenchDate(days.at(-1)!) : ""}`}
          </h2>
          <span className="badge">
            Capacité : {data.settings.capacity} places
          </span>
        </div>
        <p>
          Occupation maximale de chaque journée. Cliquez sur un séjour pour
          l’ouvrir.
        </p>
        <div className={"calendar " + view}>
          {days.map((day) => {
            const occupied = occupancy ? peakForDay(occupancy.periods, day) : 0;
            const remaining = data.settings.capacity - occupied;
            return (
              <div
                key={day}
                className={
                  "calendar-day " + (day === data.today ? "is-today" : "")
                }
              >
                <button
                  className="day-heading"
                  onClick={() => {
                    setDate(day);
                    setView("day");
                  }}
                >
                  {frenchDate(day, { weekday: "short", day: "numeric" })}
                </button>
                <div className={remaining < 0 ? "late" : "calendar-count"}>
                  <strong>
                    {occupied} / {data.settings.capacity}
                  </strong>
                  <small>
                    {remaining >= 0
                      ? `${remaining} places restantes`
                      : `${-remaining} places en dépassement`}
                  </small>
                </div>
                <div className="occupation-bar">
                  <span
                    style={{
                      width:
                        Math.min(
                          100,
                          (occupied / data.settings.capacity) * 100,
                        ) + "%",
                    }}
                  />
                </div>
                {data.bookings
                  .filter((b) => staysOn(b, day, data.now))
                  .map((b) => (
                    <button
                      key={b.id}
                      className={"stay status-" + b.status}
                      onClick={() => void edit(b)}
                    >
                      <strong>{b.name}</strong>
                      <small>
                        {b.plate} · {statuses[b.status]}
                      </small>
                    </button>
                  ))}
              </div>
            );
          })}
        </div>
      </section>
      {view === "day" && (
        <section className="panel">
          <h2>Rendez-vous et transferts du {frenchDate(date)}</h2>
          <EventList events={events} bookings={data.bookings} edit={edit} />
        </section>
      )}
    </>
  );
}
function SettingsPage({
  data,
  busy,
  run,
}: {
  data: Snapshot;
  busy: boolean;
  run: (fn: () => Promise<unknown>, message?: string) => Promise<void>;
}) {
  const [capacity, setCapacity] = useState(data.settings.capacity);
  const info = (d: string | null) =>
    d
      ? new Date(d).toLocaleString("fr-FR", { timeZone: "Europe/Paris" })
      : "Aucune copie réussie";
  const saveSettings = (settings: Settings) =>
    command("set_settings", { settings });
  return (
    <div className="settings-grid">
      <section className="panel">
        <h2>Votre parking</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void run(
              () => saveSettings({ ...data.settings, capacity }),
              "Capacité enregistrée.",
            );
          }}
        >
          <label>
            Nombre de places
            <input
              required
              type="number"
              min={1}
              max={100000}
              value={capacity}
              onChange={(e) => setCapacity(Number(e.target.value))}
            />
          </label>
          <p>
            Une réduction est refusée si les réservations ou les voitures
            présentes dépassent la nouvelle capacité.
          </p>
          <button className="primary" disabled={busy}>
            Enregistrer la capacité
          </button>
        </form>
      </section>
      <section className="panel">
        <h2>Sauvegardes</h2>
        <p>
          Une sauvegarde à la première ouverture de chaque journée, puis 30
          secondes après les modifications. Les 30 dernières journées
          d’utilisation sont conservées.
        </p>
        <dl>
          <dt>Dernière sauvegarde locale</dt>
          <dd>{info(data.backup.local)}</dd>
          <dt>Dernière copie externe réussie</dt>
          <dd>{info(data.backup.external)}</dd>
          <dt>Dossier externe</dt>
          <dd className="path">
            {data.settings.external_folder ?? "Aucun dossier choisi"}
          </dd>
        </dl>
        <div className="stack">
          <button
            className="primary"
            disabled={busy}
            onClick={() =>
              void run(
                () => command("backup_now"),
                "Sauvegarde locale créée ; consultez le résultat de la copie externe ci-dessus.",
              )
            }
          >
            Sauvegarder maintenant
          </button>
          <button
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const folder = await pickFolder();
                if (typeof folder === "string") {
                  await saveSettings({
                    ...data.settings,
                    external_folder: folder,
                  });
                  await command("backup_now");
                }
              }, "Dossier externe configuré.")
            }
          >
            Choisir un dossier externe
          </button>
          {data.settings.external_folder && (
            <button
              disabled={busy}
              onClick={() =>
                void run(
                  () =>
                    saveSettings({ ...data.settings, external_folder: null }),
                  "Copie externe désactivée.",
                )
              }
            >
              Désactiver la copie externe
            </button>
          )}
          <button
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const path = await pickBackup();
                if (typeof path === "string") {
                  const description = await command<string>("prepare_restore", {
                    path,
                  });
                  if (await ask(description + " Confirmer la restauration ?"))
                    await command("restore");
                }
              }, "Opération de restauration terminée.")
            }
          >
            Restaurer une sauvegarde…
          </button>
        </div>
      </section>
      <section className="panel">
        <h2>À propos</h2>
        <p>Parking local · version 0.1.0</p>
        <p>
          Vos clients et réservations sont conservés sur cet ordinateur, dans
          votre compte utilisateur. Aucun compte en ligne n’est nécessaire.
        </p>
        <p>
          Dates et horaires : Europe/Paris. Lors du changement d’heure
          d’automne, les horaires ambigus réservent la période la plus prudente.
        </p>
      </section>
    </div>
  );
}
