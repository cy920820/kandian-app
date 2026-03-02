use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use tauri::Manager;

fn sanitize_ext(ext: Option<&str>, media_type: Option<&str>) -> String {
  let cleaned = ext
    .unwrap_or_default()
    .trim()
    .trim_start_matches('.')
    .to_ascii_lowercase();
  if (2..=6).contains(&cleaned.len()) && cleaned.chars().all(|c| c.is_ascii_alphanumeric()) {
    return cleaned;
  }
  match media_type.unwrap_or("video") {
    "image" => "jpg".into(),
    _ => "mp4".into(),
  }
}

fn build_file_name(media_type: Option<&str>, ext: &str) -> String {
  let kind = if media_type == Some("image") { "image" } else { "video" };
  let ts = SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .map(|d| d.as_secs())
    .unwrap_or(0);
  format!("kandian-{kind}-{ts}.{ext}")
}

fn unique_path(path: PathBuf) -> PathBuf {
  if !path.exists() {
    return path;
  }
  let parent = path.parent().unwrap_or_else(|| Path::new("."));
  let stem = path
    .file_stem()
    .and_then(|s| s.to_str())
    .unwrap_or("kandian");
  let ext = path.extension().and_then(|s| s.to_str()).unwrap_or("");
  for i in 1..10_000 {
    let candidate_name = if ext.is_empty() {
      format!("{stem}-{i}")
    } else {
      format!("{stem}-{i}.{ext}")
    };
    let candidate = parent.join(candidate_name);
    if !candidate.exists() {
      return candidate;
    }
  }
  path
}

#[tauri::command]
async fn save_media_to_downloads(
  app: tauri::AppHandle,
  bytes: Vec<u8>,
  media_type: Option<String>,
  ext: Option<String>,
) -> Result<String, String> {
  if bytes.is_empty() {
    return Err("empty media bytes".into());
  }

  let ext = sanitize_ext(ext.as_deref(), media_type.as_deref());
  let downloads_dir = app
    .path()
    .download_dir()
    .map_err(|e| format!("failed to resolve Downloads directory: {e}"))?;
  std::fs::create_dir_all(&downloads_dir)
    .map_err(|e| format!("failed to create Downloads directory: {e}"))?;

  let file_name = build_file_name(media_type.as_deref(), &ext);
  let save_path = unique_path(downloads_dir.join(file_name));
  std::fs::write(&save_path, &bytes).map_err(|e| format!("failed to write media file: {e}"))?;

  Ok(save_path.to_string_lossy().to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .invoke_handler(tauri::generate_handler![save_media_to_downloads])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
