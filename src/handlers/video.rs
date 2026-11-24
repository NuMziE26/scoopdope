use axum::{
    body::Body,
    extract::{Path, State},
    http::{header, HeaderMap, HeaderValue, StatusCode},
    response::{IntoResponse, Response},
};
use std::sync::Arc;
use tokio::io::{AsyncReadExt, AsyncSeekExt};
use tokio_util::io::ReaderStream;

use crate::AppState;

/// Parse a single `Range: bytes=start-end` header value against a known total size.
/// Returns `Ok(Some((start, end)))` for a satisfiable range, `Ok(None)` when the
/// header is absent or not a byte range we handle, and `Err(())` when the range
/// is syntactically invalid or unsatisfiable (caller responds with 416).
fn parse_range(headers: &HeaderMap, total: u64) -> Result<Option<(u64, u64)>, ()> {
    let raw = match headers.get(header::RANGE) {
        Some(v) => v.to_str().map_err(|_| ())?,
        None => return Ok(None),
    };

    let spec = match raw.strip_prefix("bytes=") {
        Some(s) => s,
        None => return Ok(None),
    };

    // Only handle a single range; multi-range requests fall back to full body.
    if spec.contains(',') {
        return Ok(None);
    }

    let (start_s, end_s) = spec.split_once('-').ok_or(())?;

    if start_s.is_empty() {
        // Suffix range: bytes=-N (last N bytes).
        let suffix: u64 = end_s.parse().map_err(|_| ())?;
        if suffix == 0 || total == 0 {
            return Err(());
        }
        let start = total.saturating_sub(suffix);
        return Ok(Some((start, total - 1)));
    }

    let start: u64 = start_s.parse().map_err(|_| ())?;
    let end: u64 = if end_s.is_empty() {
        total.saturating_sub(1)
    } else {
        end_s.parse().map_err(|_| ())?
    };

    if start > end || start >= total {
        return Err(());
    }

    let end = end.min(total - 1);
    Ok(Some((start, end)))
}

fn range_not_satisfiable(total: u64) -> Response {
    let mut resp = StatusCode::RANGE_NOT_SATISFIABLE.into_response();
    if let Ok(v) = HeaderValue::from_str(&format!("bytes */{}", total)) {
        resp.headers_mut().insert(header::CONTENT_RANGE, v);
    }
    resp
}

pub async fn stream_video(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    headers: HeaderMap,
) -> Response {
    let path = match state.video_path(&id) {
        Some(p) => p,
        None => return StatusCode::NOT_FOUND.into_response(),
    };

    let mut file = match tokio::fs::File::open(&path).await {
        Ok(f) => f,
        Err(_) => return StatusCode::NOT_FOUND.into_response(),
    };

    let total = match file.metadata().await {
        Ok(m) => m.len(),
        Err(_) => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    };

    let content_type = mime_guess::from_path(&path)
        .first_or_octet_stream()
        .to_string();

    let range = match parse_range(&headers, total) {
        Ok(r) => r,
        Err(()) => return range_not_satisfiable(total),
    };

    match range {
        Some((start, end)) => {
            if file.seek(std::io::SeekFrom::Start(start)).await.is_err() {
                return StatusCode::INTERNAL_SERVER_ERROR.into_response();
            }
            let len = end - start + 1;
            let stream = ReaderStream::new(file.take(len));
            let body = Body::from_stream(stream);

            let mut resp = Response::new(body);
            *resp.status_mut() = StatusCode::PARTIAL_CONTENT;
            let h = resp.headers_mut();
            h.insert(header::ACCEPT_RANGES, HeaderValue::from_static("bytes"));
            h.insert(header::CONTENT_TYPE, HeaderValue::from_str(&content_type).unwrap());
            h.insert(header::CONTENT_LENGTH, HeaderValue::from(len));
            if let Ok(v) = HeaderValue::from_str(&format!("bytes {}-{}/{}", start, end, total)) {
                h.insert(header::CONTENT_RANGE, v);
            }
            resp
        }
        None => {
            let stream = ReaderStream::new(file);
            let body = Body::from_stream(stream);

            let mut resp = Response::new(body);
            let h = resp.headers_mut();
            h.insert(header::ACCEPT_RANGES, HeaderValue::from_static("bytes"));
            h.insert(header::CONTENT_TYPE, HeaderValue::from_str(&content_type).unwrap());
            h.insert(header::CONTENT_LENGTH, HeaderValue::from(total));
            resp
        }
    }
}
