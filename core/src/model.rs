use serde::{Deserialize, Serialize};
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Transfer {
    pub kind: String,
    pub date: String,
    pub time: Option<String>,
    pub notes: String,
}
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Booking {
    pub id: Option<i64>,
    pub client_id: Option<i64>,
    pub name: String,
    pub phone: String,
    pub vehicle: String,
    pub plate: String,
    pub start_date: String,
    pub start_time: Option<String>,
    pub end_date: String,
    pub end_time: Option<String>,
    pub notes: String,
    pub flight: String,
    pub amount_cents: i64,
    pub paid: bool,
    pub status: String,
    #[serde(default)]
    pub actual_in: Option<i64>,
    #[serde(default)]
    pub actual_out: Option<i64>,
    #[serde(default)]
    pub transfers: Vec<Transfer>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Client {
    pub id: i64,
    pub name: String,
    pub phone: String,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Settings {
    pub capacity: i64,
    pub external_folder: Option<String>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackupInfo {
    pub local: Option<String>,
    pub external: Option<String>,
    pub error: Option<String>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Snapshot {
    pub bookings: Vec<Booking>,
    pub clients: Vec<Client>,
    pub settings: Settings,
    pub backup: BackupInfo,
    pub today: String,
    pub now: i64,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Period {
    pub start: i64,
    pub end: i64,
    pub occupied: i64,
    pub remaining: i64,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Availability {
    pub available: bool,
    pub minimum_remaining: i64,
    pub periods: Vec<Period>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Appointment {
    pub booking_id: i64,
    pub client_id: i64,
    pub name: String,
    pub phone: String,
    pub vehicle: String,
    pub plate: String,
    pub time: Option<String>,
    pub action: String,
    pub notes: String,
}
