use crate::{model::Appointment, Result};
use std::{fs, path::Path};
fn literal(s: &str) -> Vec<u8> {
    let (bytes, _, _) = encoding_rs::WINDOWS_1252.encode(s);
    let mut out = vec![b'('];
    for b in bytes.iter() {
        match b {
            b'(' | b')' | b'\\' => {
                out.push(b'\\');
                out.push(*b);
            }
            0..=31 => out.push(b' '),
            _ => out.push(*b),
        }
    }
    out.push(b')');
    out
}
pub fn export(day: &str, events: &[Appointment], path: &Path) -> Result<()> {
    let date = crate::rules::date(day)?.format("%d/%m/%Y").to_string();
    let count = events
        .iter()
        .map(|a| a.client_id)
        .collect::<std::collections::BTreeSet<_>>()
        .len();
    let mut lines = vec![
        format!("Parking local — Feuille du {date}"),
        format!("{} rendez-vous • {} clients distincts", events.len(), count),
        String::new(),
    ];
    if events.is_empty() {
        lines.push("Aucun rendez-vous ce jour.".into());
    }
    for a in events {
        for text in [
            format!(
                "{} — {}",
                a.time.as_deref().unwrap_or("Horaire à préciser"),
                a.action
            ),
            format!(
                "{} • Tél. {} • {} • {}",
                a.name, a.phone, a.vehicle, a.plate
            ),
            a.notes.clone(),
        ] {
            if text.is_empty() {
                continue;
            }
            let mut line = String::new();
            for word in text.split_whitespace() {
                if line.chars().count() + word.chars().count() + 1 > 88 && !line.is_empty() {
                    lines.push(std::mem::take(&mut line));
                }
                if !line.is_empty() {
                    line.push(' ');
                }
                line.push_str(word);
            }
            if !line.is_empty() {
                lines.push(line);
            }
        }
        lines.push(String::new());
    }
    let pages = lines.chunks(45).collect::<Vec<_>>();
    let mut objects: Vec<Vec<u8>> = vec![];
    objects.push(b"<< /Type /Catalog /Pages 2 0 R >>".to_vec());
    let kids = (0..pages.len())
        .map(|i| format!("{} 0 R", 4 + i * 2))
        .collect::<Vec<_>>()
        .join(" ");
    objects.push(format!("<< /Type /Pages /Kids [{kids}] /Count {} >>", pages.len()).into_bytes());
    objects.push(
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"
            .to_vec(),
    );
    for (index, lines) in pages.iter().enumerate() {
        objects.push(format!("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents {} 0 R >>",5+index*2).into_bytes());
        let mut stream = b"BT /F1 11 Tf 45 795 Td 16 TL\n".to_vec();
        for line in *lines {
            stream.extend(literal(line));
            stream.extend(b" Tj T*\n");
        }
        stream.extend(literal(&format!("Page {} / {}", index + 1, pages.len())));
        stream.extend(b" Tj ET\n");
        let mut obj = format!("<< /Length {} >>\nstream\n", stream.len()).into_bytes();
        obj.extend(stream);
        obj.extend(b"endstream");
        objects.push(obj);
    }
    let mut pdf = b"%PDF-1.4\n%\xE2\xE3\xCF\xD3\n".to_vec();
    let mut offsets = vec![0];
    for (i, obj) in objects.iter().enumerate() {
        offsets.push(pdf.len());
        pdf.extend(format!("{} 0 obj\n", i + 1).as_bytes());
        pdf.extend(obj);
        pdf.extend(b"\nendobj\n");
    }
    let xref = pdf.len();
    pdf.extend(format!("xref\n0 {}\n0000000000 65535 f \n", offsets.len()).as_bytes());
    for offset in offsets.iter().skip(1) {
        pdf.extend(format!("{offset:010} 00000 n \n").as_bytes());
    }
    pdf.extend(
        format!(
            "trailer\n<< /Size {} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n",
            offsets.len()
        )
        .as_bytes(),
    );
    let temp = path.with_extension("pdf.tmp");
    fs::write(&temp, pdf).map_err(crate::err)?;
    fs::File::open(&temp)
        .map_err(crate::err)?
        .sync_all()
        .map_err(crate::err)?;
    crate::replace_file(&temp, path)
}
