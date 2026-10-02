export type Status =
  "option" | "confirmed" | "active" | "completed" | "cancelled";
export interface Transfer {
  kind: "outbound" | "return";
  date: string;
  time: string | null;
  notes: string;
}
export interface Booking {
  id: number | null;
  client_id: number | null;
  name: string;
  phone: string;
  vehicle: string;
  plate: string;
  start_date: string;
  start_time: string | null;
  end_date: string;
  end_time: string | null;
  notes: string;
  flight: string;
  amount_cents: number;
  paid: boolean;
  status: Status;
  actual_in: number | null;
  actual_out: number | null;
  transfers: Transfer[];
}
export interface Client {
  id: number;
  name: string;
  phone: string;
}
export interface Settings {
  capacity: number;
  external_folder: string | null;
}
export interface BackupInfo {
  local: string | null;
  external: string | null;
  error: string | null;
}
export interface Snapshot {
  bookings: Booking[];
  clients: Client[];
  settings: Settings;
  backup: BackupInfo;
  today: string;
  now: number;
}
export interface Period {
  start: number;
  end: number;
  occupied: number;
  remaining: number;
}
export interface Availability {
  available: boolean;
  minimum_remaining: number;
  periods: Period[];
}
export interface Appointment {
  booking_id: number;
  client_id: number;
  name: string;
  phone: string;
  vehicle: string;
  plate: string;
  time: string | null;
  action: string;
  notes: string;
}
