#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
use parking_core::{model::*, Store};
use std::{
    path::PathBuf,
    sync::{Arc, Mutex},
};
use tauri::{Manager, State};
type Shared = Arc<Mutex<Store>>;
fn access<T>(
    state: State<'_, Shared>,
    f: impl FnOnce(&mut Store) -> Result<T, String>,
) -> Result<T, String> {
    {
        let mut store = state
            .lock()
            .map_err(|_| "Le service de données est indisponible.".to_string())?;
        f(&mut store)
    }
}
#[tauri::command]
fn snapshot(state: State<'_, Shared>) -> Result<Snapshot, String> {
    access(state, |s| s.snapshot())
}
#[tauri::command]
fn save_booking(state: State<'_, Shared>, booking: Booking) -> Result<i64, String> {
    access(state, |s| s.save(booking))
}
#[tauri::command]
fn availability(state: State<'_, Shared>, booking: Booking) -> Result<Availability, String> {
    access(state, |s| s.availability(&booking))
}
#[tauri::command]
fn presence(state: State<'_, Shared>, id: i64, arriving: bool) -> Result<(), String> {
    access(state, |s| s.presence(id, arriving))
}
#[tauri::command]
fn set_settings(state: State<'_, Shared>, settings: Settings) -> Result<(), String> {
    access(state, |s| s.set_settings(settings))
}
#[tauri::command]
fn day(state: State<'_, Shared>, date: String) -> Result<Vec<Appointment>, String> {
    access(state, |s| s.day(&date))
}
#[tauri::command]
fn occupancy(state: State<'_, Shared>, start: String, end: String) -> Result<Availability, String> {
    access(state, |s| s.occupancy(&start, &end))
}
#[tauri::command]
fn backup_now(state: State<'_, Shared>) -> Result<BackupInfo, String> {
    access(state, |s| s.backup_now())
}
#[tauri::command]
fn prepare_restore(state: State<'_, Shared>, path: PathBuf) -> Result<String, String> {
    access(state, |s| s.prepare_restore(&path))
}
#[tauri::command]
fn restore(state: State<'_, Shared>) -> Result<(), String> {
    access(state, |s| s.restore())
}
#[tauri::command]
fn export_pdf(state: State<'_, Shared>, date: String, path: PathBuf) -> Result<(), String> {
    access(state, |s| s.export_pdf(&date, &path))
}
#[tauri::command]
fn install_available(app: tauri::AppHandle) -> bool {
    #[cfg(target_os = "linux")]
    {
        let Some(source) = std::env::var_os("APPIMAGE") else {
            return false;
        };
        let Ok(data) = app.path().data_dir() else {
            return false;
        };
        source != data.join("parking-local/application/Parking-local.AppImage")
    }
    #[cfg(not(target_os = "linux"))]
    {
        let _ = app;
        false
    }
}
#[tauri::command]
fn install_linux(app: tauri::AppHandle, state: State<'_, Shared>) -> Result<(), String> {
    #[cfg(target_os = "linux")]
    {
        use std::{fs, os::unix::fs::PermissionsExt};
        let source = PathBuf::from(
            std::env::var_os("APPIMAGE")
                .ok_or("Ouvrez le fichier AppImage pour installer le raccourci.")?,
        );
        let data = app.path().data_dir().map_err(|e| e.to_string())?;
        let dir = data.join("parking-local/application");
        let applications = data.join("applications");
        fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        fs::create_dir_all(&applications).map_err(|e| e.to_string())?;
        access(state, |s| s.backup_now().map(|_| ()))?;
        let target = dir.join("Parking-local.AppImage");
        let tmp = dir.join("Parking-local.tmp");
        fs::copy(&source, &tmp).map_err(|e| e.to_string())?;
        fs::set_permissions(&tmp, fs::Permissions::from_mode(0o755)).map_err(|e| e.to_string())?;
        fs::rename(&tmp, &target).map_err(|e| e.to_string())?;
        let icon = dir.join("parking.png");
        fs::write(&icon, include_bytes!("../icons/128x128.png")).map_err(|e| e.to_string())?;
        let escape = |s: &std::path::Path| {
            s.to_string_lossy()
                .replace('\\', "\\\\")
                .replace('"', "\\\"")
                .replace('`', "\\`")
                .replace('$', "\\$")
                .replace('%', "%%")
        };
        let entry=format!("[Desktop Entry]\nType=Application\nName=Parking local\nComment=Gestion locale du parking\nExec=\"{}\"\nIcon={}\nTerminal=false\nCategories=Office;\n",escape(&target),icon.to_string_lossy());
        fs::write(applications.join("fr.parking-local.desktop"), entry)
            .map_err(|e| e.to_string())?;
        Ok(())
    }
    #[cfg(not(target_os = "linux"))]
    {
        let _ = (app, state);
        Err("Utilisez l’installateur Windows.".into())
    }
}
fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.show();
                let _ = w.set_focus();
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let root = app.path().app_local_data_dir()?;
            let store = Store::open(root).map_err(std::io::Error::other)?;
            let shared = Arc::new(Mutex::new(store));
            app.manage(shared.clone());
            std::thread::spawn(move || loop {
                std::thread::sleep(std::time::Duration::from_secs(5));
                if let Ok(mut s) = shared.lock() {
                    if let Err(e) = s.tick(false) {
                        s.backup_info.error = Some(e);
                    }
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            snapshot,
            save_booking,
            availability,
            presence,
            set_settings,
            day,
            occupancy,
            backup_now,
            prepare_restore,
            restore,
            export_pdf,
            install_available,
            install_linux
        ])
        .on_window_event(|window, event| {
            // Flush pending changes before normal window close; the frontend handles unsaved form confirmation.
            if let tauri::WindowEvent::Destroyed = event {
                if let Some(s) = window.try_state::<Shared>() {
                    if let Ok(mut store) = s.lock() {
                        let _ = store.backup_now();
                    }
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("Impossible de démarrer Parking local");
}
