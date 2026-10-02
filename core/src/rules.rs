use crate::model::*;
use chrono::{LocalResult, NaiveDate, NaiveDateTime, TimeZone};
use chrono_tz::Europe::Paris;
pub const FOREVER: i64 = 253402214400;
pub fn date(value: &str) -> Result<NaiveDate, String> {
    NaiveDate::parse_from_str(value, "%Y-%m-%d").map_err(|_| "Date invalide.".into())
}
pub fn timestamp(day: &str, time: Option<&str>, end: bool) -> Result<i64, String> {
    let d = date(day)?;
    let naive = if let Some(t) = time.filter(|t| !t.is_empty()) {
        NaiveDateTime::parse_from_str(&format!("{day} {t}"), "%Y-%m-%d %H:%M")
            .map_err(|_| "Heure invalide.".to_string())?
    } else {
        (if end {
            d.succ_opt().ok_or("Date trop éloignée.")?
        } else {
            d
        })
        .and_hms_opt(0, 0, 0)
        .unwrap()
    };
    match Paris.from_local_datetime(&naive) {
        LocalResult::Single(t) => Ok(t.timestamp()),
        LocalResult::Ambiguous(a, b) => Ok(if end { a.max(b) } else { a.min(b) }.timestamp()),
        LocalResult::None => Err(
            "Cette heure n’existe pas lors du passage à l’heure d’été. Choisissez une autre heure."
                .into(),
        ),
    }
}
pub fn planned(b: &Booking) -> Result<(i64, i64), String> {
    let s = timestamp(&b.start_date, b.start_time.as_deref(), false)?;
    let e = timestamp(&b.end_date, b.end_time.as_deref(), true)?;
    if s >= e {
        return Err("Le retrait doit être après le dépôt.".into());
    }
    Ok((s, e))
}
pub fn interval(b: &Booking, now: i64) -> Result<Option<(i64, i64)>, String> {
    let (s, e) = planned(b)?;
    Ok(match b.status.as_str() {
        "option" | "confirmed" => Some((s, e)),
        "active" => Some((
            b.actual_in.unwrap_or(s),
            if e <= now {
                FOREVER
            } else {
                e.max(b.actual_in.unwrap_or(s) + 1)
            },
        )),
        "completed" => b.actual_in.zip(b.actual_out),
        "cancelled" => None,
        _ => return Err("Statut inconnu.".into()),
    })
}
pub fn availability(
    bookings: &[Booking],
    start: i64,
    end: i64,
    capacity: i64,
    exclude: Option<i64>,
    now: i64,
    adding: i64,
) -> Result<Availability, String> {
    if start >= end {
        return Err("Période invalide.".into());
    }
    let mut events = std::collections::BTreeMap::<i64, i64>::new();
    events.insert(start, 0);
    events.insert(end, 0);
    for b in bookings {
        if exclude.is_some() && b.id == exclude {
            continue;
        }
        if let Some((s, e)) = interval(b, now)? {
            if s < end && e > start {
                *events.entry(s.max(start)).or_default() += 1;
                *events.entry(e.min(end)).or_default() -= 1;
            }
        }
    }
    let mut occupied = adding;
    let mut previous = start;
    let mut periods = vec![];
    for (at, delta) in events {
        if at > previous {
            periods.push(Period {
                start: previous,
                end: at,
                occupied,
                remaining: capacity - occupied,
            });
        }
        occupied += delta;
        previous = at;
    }
    let minimum_remaining = periods
        .iter()
        .map(|p| p.remaining)
        .min()
        .unwrap_or(capacity - adding);
    Ok(Availability {
        available: minimum_remaining >= 0,
        minimum_remaining,
        periods,
    })
}
pub fn appointments(bookings: &[Booking], day: &str) -> Vec<Appointment> {
    let mut result = vec![];
    for b in bookings.iter().filter(|b| b.status != "cancelled") {
        let mut add = |time: Option<String>, action: &str, notes: String| {
            result.push(Appointment {
                booking_id: b.id.unwrap_or(0),
                client_id: b.client_id.unwrap_or(0),
                name: b.name.clone(),
                phone: b.phone.clone(),
                vehicle: b.vehicle.clone(),
                plate: b.plate.clone(),
                time,
                action: action.into(),
                notes,
            })
        };
        if b.start_date == day {
            add(b.start_time.clone(), "Dépôt au parking", b.notes.clone());
        }
        if b.end_date == day {
            add(b.end_time.clone(), "Retrait au parking", b.notes.clone());
        }
        for t in &b.transfers {
            if t.date == day {
                add(
                    t.time.clone(),
                    if t.kind == "outbound" {
                        "Accompagnement à l’aéroport"
                    } else {
                        "Récupération à l’aéroport"
                    },
                    t.notes.clone(),
                );
            }
        }
    }
    result.sort_by_key(|a| {
        (
            a.time.is_none(),
            a.time.clone(),
            a.name.clone(),
            a.booking_id,
        )
    });
    result
}
