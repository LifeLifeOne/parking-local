use super::*;
use rules::*;
fn booking(start: &str, end: &str) -> Booking {
    Booking {
        name: "Élodie Martin".into(),
        phone: "06 12 34 56 78".into(),
        vehicle: "Renault Clio".into(),
        plate: "AB-123-CD".into(),
        start_date: start.into(),
        end_date: end.into(),
        start_time: Some("10:00".into()),
        end_time: Some("10:00".into()),
        status: "confirmed".into(),
        amount_cents: 12550,
        ..Default::default()
    }
}
#[test]
fn overlap_options_cancellation_and_touching() {
    let mut b = booking("2030-01-01", "2030-01-03");
    b.id = Some(1);
    b.status = "option".into();
    let (s, e) = planned(&booking("2030-01-03", "2030-01-04")).unwrap();
    assert!(
        availability(&[b.clone()], s, e, 1, None, 0, 1)
            .unwrap()
            .available
    );
    let (s, e) = planned(&booking("2030-01-02", "2030-01-04")).unwrap();
    assert!(
        !availability(&[b.clone()], s, e, 1, None, 0, 1)
            .unwrap()
            .available
    );
    assert!(
        availability(&[b.clone()], s, e, 1, Some(1), 0, 1)
            .unwrap()
            .available
    );
    b.status = "cancelled".into();
    assert!(availability(&[b], s, e, 1, None, 0, 1).unwrap().available);
}
#[test]
fn unknown_hours_midnight_dst() {
    let mut b = booking("2030-01-01", "2030-01-01");
    b.start_time = None;
    b.end_time = None;
    let (s, e) = planned(&b).unwrap();
    assert_eq!(e - s, 86400);
    let (s, e) = planned(&Booking {
        start_date: "2026-03-29".into(),
        end_date: "2026-03-29".into(),
        ..b.clone()
    })
    .unwrap();
    assert_eq!(e - s, 23 * 3600);
    let (s, e) = planned(&Booking {
        start_date: "2026-10-25".into(),
        end_date: "2026-10-25".into(),
        ..b
    })
    .unwrap();
    assert_eq!(e - s, 25 * 3600);
    assert!(timestamp("2026-03-29", Some("02:30"), false).is_err());
    assert_eq!(
        timestamp("2026-10-25", Some("02:30"), true).unwrap()
            - timestamp("2026-10-25", Some("02:30"), false).unwrap(),
        3600
    );
    let b = Booking {
        start_time: Some("23:30".into()),
        end_time: Some("00:30".into()),
        ..booking("2030-01-01", "2030-01-02")
    };
    assert_eq!(planned(&b).unwrap().1 - planned(&b).unwrap().0, 3600);
}
#[test]
fn overdue_never_silently_departs() {
    let mut b = booking("2020-01-01", "2020-01-02");
    b.status = "active".into();
    b.actual_in = Some(timestamp("2020-01-01", Some("09:00"), false).unwrap());
    assert_eq!(
        interval(&b, Utc::now().timestamp()).unwrap().unwrap().1,
        FOREVER
    );
    b.status = "completed".into();
    b.actual_out = Some(timestamp("2020-01-03", Some("09:00"), false).unwrap());
    assert_eq!(
        interval(&b, Utc::now().timestamp()).unwrap(),
        b.actual_in.zip(b.actual_out)
    );
}
#[test]
fn persistence_capacity_clients_transfers_and_edit() {
    let dir = tempfile::tempdir().unwrap();
    let mut s = Store::open(dir.path()).unwrap();
    s.set_settings(Settings {
        capacity: 1,
        external_folder: None,
    })
    .unwrap();
    let mut b = booking("2030-01-01", "2030-01-03");
    b.transfers = vec![Transfer {
        kind: "return".into(),
        date: "2030-01-03".into(),
        time: Some("11:30".into()),
        notes: "Terminal 2".into(),
    }];
    let id = s.save(b.clone()).unwrap();
    assert!(s.save(b.clone()).is_err());
    b.id = Some(id);
    b.client_id = s.bookings().unwrap()[0].client_id;
    assert!(s.save(b).is_ok());
    assert_eq!(s.snapshot().unwrap().clients.len(), 1);
    let day = s.day("2030-01-03").unwrap();
    assert_eq!(day.len(), 2);
    assert_eq!(day[1].time.as_deref(), Some("11:30"));
    let mut other = booking("2030-01-02", "2030-01-04");
    other.status = "cancelled".into();
    s.save(other).unwrap();
    assert_eq!(s.bookings().unwrap().len(), 2);
    s.presence(id, true).unwrap();
    assert!(s
        .save(Booking {
            status: "cancelled".into(),
            ..s.bookings()
                .unwrap()
                .into_iter()
                .find(|b| b.id == Some(id))
                .unwrap()
        })
        .is_err());
    s.presence(id, false).unwrap();
    assert_eq!(
        s.bookings()
            .unwrap()
            .iter()
            .find(|b| b.id == Some(id))
            .unwrap()
            .status,
        "completed"
    );
}
#[test]
fn capacity_reduction_refused() {
    let dir = tempfile::tempdir().unwrap();
    let mut s = Store::open(dir.path()).unwrap();
    s.save(booking("2030-01-01", "2030-01-04")).unwrap();
    s.save(booking("2030-01-02", "2030-01-03")).unwrap();
    assert!(s
        .set_settings(Settings {
            capacity: 1,
            external_folder: None
        })
        .is_err());
}
#[test]
fn backup_restore_corruption_incompatibility_missing_media() {
    let dir = tempfile::tempdir().unwrap();
    let mut s = Store::open(dir.path()).unwrap();
    s.save(booking("2030-01-01", "2030-01-02")).unwrap();
    s.backup_now().unwrap();
    let backup = dir
        .path()
        .join("backups")
        .join(format!("{}.sqlite", s.snapshot().unwrap().today));
    let exported = dir.path().join("exported.sqlite");
    fs::copy(&backup, &exported).unwrap();
    s.save(booking("2030-02-01", "2030-02-02")).unwrap();
    assert!(s
        .prepare_restore(&exported)
        .unwrap()
        .contains("1 réservation"));
    s.restore().unwrap();
    assert_eq!(s.bookings().unwrap().len(), 1);
    let bad = dir.path().join("bad.sqlite");
    fs::write(&bad, b"bad").unwrap();
    assert!(s.prepare_restore(&bad).is_err());
    let alien = dir.path().join("alien.sqlite");
    Connection::open(&alien)
        .unwrap()
        .execute_batch("CREATE TABLE nope(id);")
        .unwrap();
    assert!(s.prepare_restore(&alien).is_err());
    s.set_settings(Settings {
        capacity: 20,
        external_folder: Some(dir.path().join("absent").to_string_lossy().into()),
    })
    .unwrap();
    assert!(s.backup_now().unwrap().error.is_some());
    assert!(backup.exists());
    fs::create_dir(dir.path().join("absent")).unwrap();
    s.tick(false).unwrap();
    assert!(s.backup_info.external.is_some());
    assert!(s.backup_info.error.is_none());
}
#[test]
fn interrupted_backup_keeps_valid_previous() {
    let dir = tempfile::tempdir().unwrap();
    let s = Store::open(dir.path()).unwrap();
    let today = s.snapshot().unwrap().today;
    drop(s);
    let daily = dir.path().join("backups").join(format!("{today}.sqlite"));
    fs::rename(&daily, daily.with_extension("previous")).unwrap();
    fs::write(daily.with_extension("tmp"), b"partial").unwrap();
    let s = Store::open(dir.path()).unwrap();
    assert!(daily.exists());
    assert!(Store::validate_file(&daily).is_ok());
    assert!(s.snapshot().is_ok());
}
#[test]
fn daily_pdf_is_valid_multipage() {
    let dir = tempfile::tempdir().unwrap();
    let mut s = Store::open(dir.path()).unwrap();
    s.save(booking("2030-01-01", "2030-01-02")).unwrap();
    let pdf = dir.path().join("day.pdf");
    s.export_pdf("2030-01-01", &pdf).unwrap();
    let bytes = fs::read(&pdf).unwrap();
    assert!(bytes.starts_with(b"%PDF-1.4"));
    assert!(bytes.ends_with(b"%%EOF\n"));
    let text = String::from_utf8_lossy(&bytes);
    assert!(text.contains("06 12 34 56 78"));
    assert!(text.contains("/Count 1"));
}

#[test]
fn pdf_multiple_pages_and_extension_guard() {
    let dir = tempfile::tempdir().unwrap();
    let s = Store::open(dir.path()).unwrap();
    assert!(s
        .export_pdf("2030-01-01", &dir.path().join("parking.sqlite"))
        .is_err());
    let event = Appointment {
        booking_id: 1,
        client_id: 1,
        name: "Élodie".into(),
        phone: "06 12 34".into(),
        vehicle: "Clio".into(),
        plate: "AB-123-CD".into(),
        time: None,
        action: "Dépôt".into(),
        notes: "Terminal 2".into(),
    };
    let events = vec![event; 90];
    let file = dir.path().join("many.pdf");
    crate::pdf::export("2030-01-01", &events, &file).unwrap();
    let bytes = fs::read(file).unwrap();
    assert!(String::from_utf8_lossy(&bytes).contains("/Count 9"));
}

#[test]
fn registration_is_optional_and_backups_remain_compatible() {
    let dir = tempfile::tempdir().unwrap();
    let mut s = Store::open(dir.path()).unwrap();
    let mut b = booking("2030-01-01", "2030-01-02");
    b.plate.clear();
    s.save(b).unwrap();
    assert_eq!(s.bookings().unwrap()[0].plate, "");
    s.backup_now().unwrap();
    let copy = dir
        .path()
        .join("backups")
        .join(format!("{}.sqlite", s.snapshot().unwrap().today));
    assert!(s.prepare_restore(&copy).is_ok());
    s.restore().unwrap();
    assert_eq!(s.bookings().unwrap().len(), 1);
    drop(s);
    assert_eq!(
        Store::open(dir.path()).unwrap().bookings().unwrap()[0].plate,
        ""
    );
}
