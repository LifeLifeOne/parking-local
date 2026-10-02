pub mod model;
mod pdf;
pub mod rules;
use chrono::{TimeZone, Utc};
use chrono_tz::Europe::Paris;
use model::*;
use rusqlite::{params, Connection};
use std::{
    fs,
    path::{Path, PathBuf},
    time::{Duration, Instant},
};
pub type Result<T> = std::result::Result<T, String>;
const APP_ID: i64 = 0x5041524b;
const VERSION: i64 = 1;
fn err(e: impl std::fmt::Display) -> String {
    e.to_string()
}
pub struct Store {
    conn: Connection,
    pub root: PathBuf,
    dirty: Option<Instant>,
    pub backup_info: BackupInfo,
    staged: Option<PathBuf>,
}
fn integrity(c: &Connection) -> Result<()> {
    let check: String = c
        .query_row("PRAGMA integrity_check", [], |r| r.get(0))
        .map_err(err)?;
    if check != "ok" {
        return Err("Sauvegarde corrompue : intégrité SQLite invalide.".into());
    }
    let violations: bool = c
        .prepare("PRAGMA foreign_key_check")
        .map_err(err)?
        .exists([])
        .map_err(err)?;
    if violations {
        return Err("Sauvegarde corrompue : références invalides.".into());
    }
    Ok(())
}
fn compatible(c: &Connection) -> Result<()> {
    integrity(c)?;
    let app: i64 = c
        .query_row("PRAGMA application_id", [], |r| r.get(0))
        .map_err(err)?;
    let version: i64 = c
        .query_row("PRAGMA user_version", [], |r| r.get(0))
        .map_err(err)?;
    if app != APP_ID || version != VERSION {
        return Err("Ce fichier n’est pas une sauvegarde compatible de Parking local.".into());
    }
    c.prepare("SELECT b.id,b.client_id,b.vehicle_id,b.data,c.name,c.phone,v.plate FROM bookings b JOIN clients c ON c.id=b.client_id JOIN vehicles v ON v.id=b.vehicle_id").map_err(err)?;
    c.prepare("SELECT booking_id,kind,date,time,notes FROM appointments")
        .map_err(err)?;
    let settings: Settings = serde_json::from_str(
        &c.query_row::<String, _, _>("SELECT value FROM settings WHERE key='settings'", [], |r| {
            r.get(0)
        })
        .map_err(err)?,
    )
    .map_err(err)?;
    if !(1..=100000).contains(&settings.capacity) {
        return Err("Capacité invalide dans la sauvegarde.".into());
    }
    let mut statement = c.prepare("SELECT data FROM bookings").map_err(err)?;
    for row in statement
        .query_map([], |r| r.get::<_, String>(0))
        .map_err(err)?
    {
        let b: Booking = serde_json::from_str(&row.map_err(err)?).map_err(err)?;
        rules::interval(&b, Utc::now().timestamp())?;
        if b.name.trim().is_empty()
            || b.phone.trim().is_empty()
            || b.vehicle.trim().is_empty()
            || b.plate.trim().is_empty()
            || !(0..=999999999).contains(&b.amount_cents)
        {
            return Err("Données de réservation invalides dans la sauvegarde.".into());
        }
        match b.status.as_str() {
            "active" if b.actual_in.is_none() || b.actual_out.is_some() => {
                return Err("Présence réelle invalide dans la sauvegarde.".into())
            }
            "completed" if b.actual_in.zip(b.actual_out).is_none_or(|(s, e)| s >= e) => {
                return Err("Sortie réelle invalide dans la sauvegarde.".into())
            }
            _ => (),
        }
        for t in &b.transfers {
            if !["outbound", "return"].contains(&t.kind.as_str()) {
                return Err("Transfert invalide dans la sauvegarde.".into());
            }
            rules::timestamp(&t.date, t.time.as_deref(), false)?;
        }
    }
    Ok(())
}
fn consistent_copy(from: &Connection, path: &Path) -> Result<()> {
    let mut to = Connection::open(path).map_err(err)?;
    rusqlite::backup::Backup::new(from, &mut to)
        .map_err(err)?
        .run_to_completion(64, Duration::from_millis(5), None)
        .map_err(err)?;
    compatible(&to)?;
    to.close().map_err(|(_, e)| err(e))?;
    fs::OpenOptions::new()
        .write(true)
        .open(path)
        .map_err(err)?
        .sync_all()
        .map_err(err)
}
// Windows rename does not replace files. Keep the previous valid file until the new one is in place.
fn replace_file(temp: &Path, dest: &Path) -> Result<()> {
    let old = dest.with_extension("previous");
    if old.exists() {
        fs::remove_file(&old).map_err(err)?;
    }
    if dest.exists() {
        fs::rename(dest, &old).map_err(err)?;
    }
    if let Err(e) = fs::rename(temp, dest) {
        if old.exists() {
            let _ = fs::rename(&old, dest);
        }
        return Err(err(e));
    }
    #[cfg(unix)]
    if let Some(parent) = dest.parent() {
        fs::File::open(parent)
            .map_err(err)?
            .sync_all()
            .map_err(err)?;
    }
    if old.exists() {
        fs::remove_file(old).map_err(err)?;
    }
    Ok(())
}
impl Store {
    pub fn open(root: impl AsRef<Path>) -> Result<Self> {
        let root = root.as_ref().to_path_buf();
        fs::create_dir_all(root.join("backups")).map_err(err)?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(&root, fs::Permissions::from_mode(0o700)).map_err(err)?;
        }
        // Recover an interrupted daily backup replacement.
        for entry in fs::read_dir(root.join("backups")).map_err(err)? {
            let p = entry.map_err(err)?.path();
            if p.extension().is_some_and(|x| x == "previous") {
                let dest = p.with_extension("sqlite");
                if !dest.exists() {
                    fs::rename(&p, dest).map_err(err)?;
                }
            }
        }
        let conn = Connection::open(root.join("parking.sqlite")).map_err(err)?;
        conn.busy_timeout(Duration::from_secs(5)).map_err(err)?;
        conn.execute_batch(
            "PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA synchronous=FULL;",
        )
        .map_err(err)?;
        let version: i64 = conn
            .query_row("PRAGMA user_version", [], |r| r.get(0))
            .map_err(err)?;
        if version == 0 {
            let table_count:i64=conn.query_row("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",[],|r|r.get(0)).map_err(err)?;
            if table_count > 0 {
                return Err("Base inconnue : ouverture refusée.".into());
            }
            conn.execute_batch("BEGIN; CREATE TABLE clients(id INTEGER PRIMARY KEY,name TEXT NOT NULL,phone TEXT NOT NULL); CREATE TABLE vehicles(id INTEGER PRIMARY KEY,client_id INTEGER NOT NULL REFERENCES clients(id),description TEXT NOT NULL,plate TEXT NOT NULL); CREATE TABLE bookings(id INTEGER PRIMARY KEY,client_id INTEGER NOT NULL REFERENCES clients(id),vehicle_id INTEGER NOT NULL REFERENCES vehicles(id),data TEXT NOT NULL); CREATE TABLE appointments(id INTEGER PRIMARY KEY,booking_id INTEGER NOT NULL REFERENCES bookings(id),kind TEXT NOT NULL,date TEXT NOT NULL,time TEXT,notes TEXT NOT NULL); CREATE TABLE settings(key TEXT PRIMARY KEY,value TEXT NOT NULL); INSERT INTO settings VALUES('settings','{\"capacity\":20,\"external_folder\":null}'); PRAGMA application_id=1346458187; PRAGMA user_version=1; COMMIT;").map_err(err)?;
        }
        compatible(&conn)?;
        let backup_info = fs::read(root.join("backup-state.json"))
            .ok()
            .and_then(|v| serde_json::from_slice(&v).ok())
            .unwrap_or(BackupInfo {
                local: None,
                external: None,
                error: None,
            });
        let mut store = Self {
            conn,
            root,
            dirty: None,
            backup_info,
            staged: None,
        };
        if let Err(e) = store.tick(true) {
            store.backup_info.error = Some(e);
        }
        Ok(store)
    }
    pub fn settings(&self) -> Result<Settings> {
        serde_json::from_str(
            &self
                .conn
                .query_row::<String, _, _>(
                    "SELECT value FROM settings WHERE key='settings'",
                    [],
                    |r| r.get(0),
                )
                .map_err(err)?,
        )
        .map_err(err)
    }
    pub fn bookings(&self) -> Result<Vec<Booking>> {
        let mut stmt=self.conn.prepare("SELECT b.id,b.client_id,b.data,c.name,c.phone FROM bookings b JOIN clients c ON c.id=b.client_id ORDER BY b.id DESC").map_err(err)?;
        let rows = stmt
            .query_map([], |r| {
                Ok((
                    r.get::<_, i64>(0)?,
                    r.get::<_, i64>(1)?,
                    r.get::<_, String>(2)?,
                    r.get::<_, String>(3)?,
                    r.get::<_, String>(4)?,
                ))
            })
            .map_err(err)?;
        let mut out = vec![];
        for row in rows {
            let (id, cid, data, name, phone) = row.map_err(err)?;
            let mut b: Booking = serde_json::from_str(&data).map_err(err)?;
            b.id = Some(id);
            b.client_id = Some(cid);
            b.name = name;
            b.phone = phone;
            out.push(b);
        }
        Ok(out)
    }
    pub fn snapshot(&self) -> Result<Snapshot> {
        let mut stmt = self
            .conn
            .prepare("SELECT id,name,phone FROM clients ORDER BY name COLLATE NOCASE")
            .map_err(err)?;
        let clients = stmt
            .query_map([], |r| {
                Ok(Client {
                    id: r.get(0)?,
                    name: r.get(1)?,
                    phone: r.get(2)?,
                })
            })
            .map_err(err)?
            .collect::<std::result::Result<Vec<_>, _>>()
            .map_err(err)?;
        Ok(Snapshot {
            bookings: self.bookings()?,
            clients,
            settings: self.settings()?,
            backup: self.backup_info.clone(),
            today: Utc::now()
                .with_timezone(&Paris)
                .format("%Y-%m-%d")
                .to_string(),
            now: Utc::now().timestamp(),
        })
    }
    pub fn availability(&self, b: &Booking) -> Result<Availability> {
        let (s, e) = rules::planned(b)?;
        rules::availability(
            &self.bookings()?,
            s,
            e,
            self.settings()?.capacity,
            b.id,
            Utc::now().timestamp(),
            1,
        )
    }
    fn mark_dirty(&mut self) {
        self.dirty = Some(Instant::now());
    }
    pub fn save(&mut self, mut b: Booking) -> Result<i64> {
        b.name = b.name.trim().into();
        b.phone = b.phone.trim().into();
        b.plate = b.plate.trim().to_uppercase();
        if b.name.is_empty()
            || b.phone.is_empty()
            || b.vehicle.trim().is_empty()
            || b.plate.is_empty()
        {
            return Err(
                "Renseignez le client, le téléphone, le véhicule et l’immatriculation.".into(),
            );
        }
        if b.amount_cents < 0 || b.amount_cents > 999999999 {
            return Err("Montant invalide.".into());
        }
        rules::planned(&b)?;
        let all = self.bookings()?;
        let old = if let Some(id) = b.id {
            Some(
                all.iter()
                    .find(|x| x.id == Some(id))
                    .ok_or("Réservation introuvable.")?,
            )
        } else {
            None
        };
        if let Some(old) = old {
            if ["active", "completed"].contains(&old.status.as_str()) && b.status != old.status {
                return Err(
                    "Utilisez les boutons d’arrivée et de sortie pour modifier la présence.".into(),
                );
            }
            b.actual_in = old.actual_in;
            b.actual_out = old.actual_out;
        } else {
            b.actual_in = None;
            b.actual_out = None;
        }
        if !["option", "confirmed", "cancelled"].contains(&b.status.as_str())
            && !old.is_some_and(|x| x.status == b.status)
        {
            return Err("Statut invalide.".into());
        }
        if b.status == "option" || b.status == "confirmed" {
            let availability = self.availability(&b)?;
            if !availability.available {
                return Err(conflict_message(&availability));
            }
        }
        if b.transfers
            .iter()
            .any(|t| !["outbound", "return"].contains(&t.kind.as_str()))
        {
            return Err("Type de transfert invalide.".into());
        }
        if b.transfers.iter().filter(|t| t.kind == "outbound").count() > 1
            || b.transfers.iter().filter(|t| t.kind == "return").count() > 1
        {
            return Err("Un seul transfert de chaque type est autorisé.".into());
        }
        for t in &b.transfers {
            rules::timestamp(&t.date, t.time.as_deref(), false)?;
        }
        let tx = self.conn.transaction().map_err(err)?;
        let cid = if let Some(cid) = b.client_id {
            let exists: bool = tx
                .query_row(
                    "SELECT EXISTS(SELECT 1 FROM clients WHERE id=?)",
                    [cid],
                    |r| r.get(0),
                )
                .map_err(err)?;
            if !exists {
                return Err("Client introuvable.".into());
            }
            tx.execute(
                "UPDATE clients SET name=?,phone=? WHERE id=?",
                params![b.name, b.phone, cid],
            )
            .map_err(err)?;
            cid
        } else {
            tx.execute(
                "INSERT INTO clients(name,phone) VALUES(?,?)",
                params![b.name, b.phone],
            )
            .map_err(err)?;
            tx.last_insert_rowid()
        };
        b.client_id = Some(cid);
        let vid = if let Some(id) = b.id {
            tx.query_row("SELECT vehicle_id FROM bookings WHERE id=?", [id], |r| {
                r.get::<_, i64>(0)
            })
            .map_err(err)?
        } else {
            tx.execute(
                "INSERT INTO vehicles(client_id,description,plate) VALUES(?,?,?)",
                params![cid, b.vehicle, b.plate],
            )
            .map_err(err)?;
            tx.last_insert_rowid()
        };
        tx.execute(
            "UPDATE vehicles SET client_id=?,description=?,plate=? WHERE id=?",
            params![cid, b.vehicle, b.plate, vid],
        )
        .map_err(err)?;
        let data = serde_json::to_string(&b).map_err(err)?;
        let id = if let Some(id) = b.id {
            tx.execute(
                "UPDATE bookings SET client_id=?,data=? WHERE id=?",
                params![cid, data, id],
            )
            .map_err(err)?;
            id
        } else {
            tx.execute(
                "INSERT INTO bookings(client_id,vehicle_id,data) VALUES(?,?,?)",
                params![cid, vid, data],
            )
            .map_err(err)?;
            tx.last_insert_rowid()
        };
        tx.execute("DELETE FROM appointments WHERE booking_id=?", [id])
            .map_err(err)?;
        for t in b.transfers {
            tx.execute(
                "INSERT INTO appointments(booking_id,kind,date,time,notes) VALUES(?,?,?,?,?)",
                params![id, t.kind, t.date, t.time, t.notes],
            )
            .map_err(err)?;
        }
        tx.commit().map_err(err)?;
        self.mark_dirty();
        Ok(id)
    }
    pub fn presence(&mut self, id: i64, arriving: bool) -> Result<()> {
        let mut b = self
            .bookings()?
            .into_iter()
            .find(|b| b.id == Some(id))
            .ok_or("Réservation introuvable.")?;
        let now = Utc::now().timestamp();
        if arriving {
            if !["confirmed", "option"].contains(&b.status.as_str()) {
                return Err("Seule une option ou une réservation confirmée peut arriver.".into());
            }
            b.actual_in = Some(now);
            b.status = "active".into();
            // Actual arrival must be recordable, even if reality exceeds planned capacity.
        } else {
            if b.status != "active" {
                return Err("Cette voiture n’est pas présente.".into());
            }
            b.actual_out = Some(now.max(b.actual_in.unwrap_or(now) + 1));
            b.status = "completed".into();
        }
        self.conn
            .execute(
                "UPDATE bookings SET data=? WHERE id=?",
                params![serde_json::to_string(&b).map_err(err)?, id],
            )
            .map_err(err)?;
        self.mark_dirty();
        Ok(())
    }
    pub fn set_settings(&mut self, s: Settings) -> Result<()> {
        if !(1..=100000).contains(&s.capacity) {
            return Err("La capacité doit être comprise entre 1 et 100 000.".into());
        }
        let now = Utc::now().timestamp();
        let all = self.bookings()?;
        let end = all
            .iter()
            .map(|b| rules::interval(b, now))
            .collect::<Result<Vec<_>>>()?
            .into_iter()
            .flatten()
            .map(|(_, e)| e)
            .max()
            .unwrap_or(now + 1)
            .max(now + 1);
        let a = rules::availability(&all, now, end, s.capacity, None, now, 0)?;
        if !a.available {
            return Err(conflict_message(&a));
        }
        self.conn
            .execute(
                "UPDATE settings SET value=? WHERE key='settings'",
                [serde_json::to_string(&s).map_err(err)?],
            )
            .map_err(err)?;
        self.mark_dirty();
        Ok(())
    }
    pub fn day(&self, day: &str) -> Result<Vec<Appointment>> {
        rules::date(day)?;
        Ok(rules::appointments(&self.bookings()?, day))
    }
    pub fn occupancy(&self, start: &str, end: &str) -> Result<Availability> {
        let s = rules::timestamp(start, None, false)?;
        let e = rules::timestamp(end, None, true)?;
        rules::availability(
            &self.bookings()?,
            s,
            e,
            self.settings()?.capacity,
            None,
            Utc::now().timestamp(),
            0,
        )
    }
    pub fn export_pdf(&self, day: &str, path: &Path) -> Result<()> {
        if !path
            .extension()
            .is_some_and(|e| e.eq_ignore_ascii_case("pdf"))
        {
            return Err("Choisissez un nom de fichier terminé par .pdf.".into());
        }
        pdf::export(day, &self.day(day)?, path)
    }
    pub fn tick(&mut self, startup: bool) -> Result<()> {
        let today = Utc::now()
            .with_timezone(&Paris)
            .format("%Y-%m-%d")
            .to_string();
        let daily = self.root.join("backups").join(format!("{today}.sqlite"));
        if !daily.exists()
            || self
                .dirty
                .is_some_and(|t| t.elapsed() >= Duration::from_secs(30))
        {
            self.backup_now()?;
        } else if startup || self.backup_info.error.is_some() {
            self.copy_external(&daily)?;
        }
        Ok(())
    }
    fn persist_backup_state(&self) -> Result<()> {
        let tmp = self.root.join("backup-state.tmp");
        fs::write(&tmp, serde_json::to_vec(&self.backup_info).map_err(err)?).map_err(err)?;
        replace_file(&tmp, &self.root.join("backup-state.json"))
    }
    pub fn backup_now(&mut self) -> Result<BackupInfo> {
        let today = Utc::now()
            .with_timezone(&Paris)
            .format("%Y-%m-%d")
            .to_string();
        let dir = self.root.join("backups");
        let path = dir.join(format!("{today}.sqlite"));
        let tmp = dir.join(format!("{today}.tmp"));
        if tmp.exists() {
            fs::remove_file(&tmp).map_err(err)?;
        }
        consistent_copy(&self.conn, &tmp)?;
        replace_file(&tmp, &path)?;
        self.backup_info.local = Some(Utc::now().to_rfc3339());
        self.dirty = None;
        let mut files = fs::read_dir(&dir)
            .map_err(err)?
            .filter_map(|e| e.ok().map(|e| e.path()))
            .filter(|p| {
                p.extension().is_some_and(|e| e == "sqlite")
                    && p.file_stem()
                        .and_then(|s| s.to_str())
                        .is_some_and(|s| rules::date(s).is_ok())
            })
            .collect::<Vec<_>>();
        files.sort();
        let excess = files.len().saturating_sub(30);
        for p in files.into_iter().take(excess) {
            fs::remove_file(p).map_err(err)?;
        }
        // External media failure is surfaced but never prevents local saving.
        if let Err(e) = self.copy_external(&path) {
            self.backup_info.error = Some(e);
        }
        self.persist_backup_state()?;
        Ok(self.backup_info.clone())
    }
    fn copy_external(&mut self, local: &Path) -> Result<()> {
        let Some(folder) = self.settings()?.external_folder else {
            self.backup_info.error = None;
            return Ok(());
        };
        let folder = PathBuf::from(folder);
        let result: Result<()> = (|| {
            if !folder.is_dir() {
                return Err(
                    "Dossier externe absent. La copie sera retentée automatiquement.".into(),
                );
            }
            let dest_dir = folder.join("Parking-local-sauvegardes");
            fs::create_dir_all(&dest_dir).map_err(err)?;
            let dest = dest_dir.join(local.file_name().ok_or("Nom invalide")?);
            let temp = dest.with_extension("tmp");
            if temp.exists() {
                fs::remove_file(&temp).map_err(err)?;
            }
            let source =
                Connection::open_with_flags(local, rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY)
                    .map_err(err)?;
            consistent_copy(&source, &temp)?;
            replace_file(&temp, &dest)?;
            Ok(())
        })();
        match result {
            Ok(()) => {
                self.backup_info.external = Some(Utc::now().to_rfc3339());
                self.backup_info.error = None;
                self.persist_backup_state()?;
                Ok(())
            }
            Err(e) => {
                self.backup_info.error = Some(e.clone());
                Err(e)
            }
        }
    }
    pub fn prepare_restore(&mut self, path: &Path) -> Result<String> {
        let source = Connection::open_with_flags(path, rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY)
            .map_err(err)?;
        compatible(&source)?;
        let staged = self.root.join("restore-staged.sqlite");
        if staged.exists() {
            fs::remove_file(&staged).map_err(err)?;
        }
        consistent_copy(&source, &staged)?;
        let check = Store::validate_file(&staged)?;
        let modified = fs::metadata(path)
            .and_then(|m| m.modified())
            .map(chrono::DateTime::<Utc>::from)
            .map(|d| {
                d.with_timezone(&Paris)
                    .format("%d/%m/%Y à %H:%M")
                    .to_string()
            })
            .unwrap_or_else(|_| "date inconnue".into());
        self.staged = Some(staged);
        Ok(format!("Copie du {modified} — {check} réservation(s). Les données actuelles seront remplacées. Une sauvegarde de sécurité sera conservée."))
    }
    fn validate_file(path: &Path) -> Result<i64> {
        let c = Connection::open_with_flags(path, rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY)
            .map_err(err)?;
        compatible(&c)?;
        let mut stmt = c.prepare("SELECT data FROM bookings").map_err(err)?;
        for row in stmt.query_map([], |r| r.get::<_, String>(0)).map_err(err)? {
            let b: Booking = serde_json::from_str(&row.map_err(err)?).map_err(err)?;
            rules::interval(&b, Utc::now().timestamp())?;
        }
        c.query_row("SELECT COUNT(*) FROM bookings", [], |r| r.get(0))
            .map_err(err)
    }
    pub fn restore(&mut self) -> Result<()> {
        let staged = self
            .staged
            .take()
            .ok_or("Sélectionnez d’abord une sauvegarde.")?;
        Self::validate_file(&staged)?;
        let safety = self.root.join("backups").join(format!(
            "avant-restauration-{}.sqlite",
            Utc::now().format("%Y%m%dT%H%M%S%.9f")
        ));
        consistent_copy(&self.conn, &safety)?;
        let source =
            Connection::open_with_flags(&staged, rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY)
                .map_err(err)?;
        let result: Result<()> = (|| {
            rusqlite::backup::Backup::new(&source, &mut self.conn)
                .map_err(err)?
                .run_to_completion(64, Duration::from_millis(5), None)
                .map_err(err)?;
            compatible(&self.conn)
        })();
        if let Err(e) = result {
            let rollback =
                Connection::open_with_flags(&safety, rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY)
                    .map_err(err)?;
            rusqlite::backup::Backup::new(&rollback, &mut self.conn)
                .map_err(err)?
                .run_to_completion(64, Duration::from_millis(5), None)
                .map_err(err)?;
            return Err(format!("Restauration échouée, état initial rétabli : {e}"));
        }
        drop(source);
        fs::remove_file(staged).map_err(err)?;
        self.mark_dirty();
        self.backup_now()?;
        Ok(())
    }
}
fn conflict_message(a: &Availability) -> String {
    let parts = a
        .periods
        .iter()
        .filter(|p| p.remaining < 0)
        .take(8)
        .map(|p| {
            let format = |t| {
                Paris
                    .timestamp_opt(t, 0)
                    .single()
                    .map(|t| t.format("%d/%m/%Y %H:%M").to_string())
                    .unwrap_or_else(|| "jusqu’à la sortie réelle".into())
            };
            format!(
                "{} → {} : {} place(s) manquante(s)",
                format(p.start),
                if p.end == rules::FOREVER {
                    "sortie réelle à enregistrer".into()
                } else {
                    format(p.end)
                },
                -p.remaining
            )
        })
        .collect::<Vec<_>>()
        .join(" ; ");
    format!("Capacité dépassée. {parts}")
}
#[cfg(test)]
mod tests;
