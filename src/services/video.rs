use std::io::{Read, Seek, SeekFrom};

use axum::body::Body;
use axum::http::{header, HeaderMap, HeaderValue, StatusCode};
use axum::response::{IntoResponse, Response};
use tokio_util::io::ReaderStream;

/// Parsed byte range from a `Range: bytes=...` header.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ByteRange {
    pub start: u64,
    pub end: u64,
}

impl ByteRange {
    pub fn len(&self) -> u64 {
        self.end - self.start + 1
    }
}

/// Error returned when a `Range` header cannot be satisfied.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct RangeError;

/// Parse a single-range `Range` header value against a known total size.
///
/// Supports `bytes=start-end`, `bytes=start-`, and `bytes=-suffix`.
/// Returns `Ok(None)` when the header is absent or not a byte range.
/// Returns `Err(RangeError)` for malformed or unsatisfiable ranges (416).
pub fn parse_range(header_value: Option<&str>, total: u64) -> Result<Option<ByteRange>, RangeError> {
    let value = match header_value {
        Some(v) => v.trim(),
        None => return Ok(None),
    };

    let spec = match value.strip_prefix("bytes=") {
        Some(s) => s.trim(),
        None => return Ok(None),
    };

    // Only single-range requests are supported; multi-range falls back to full body.
    if spec.contains(',') {
        return Ok(None);
    }

    let (start_str, end_str) = spec.split_once('-').ok_or(RangeError)?;
    let start_str = start_str.trim();
    let end_str = end_str.trim();

    if total == 0 {
        return Err(RangeError);
    }

    if start_str.is_empty() {
        // Suffix range: bytes=-N (last N bytes).
        let suffix: u64 = end_str.parse().map_err(|_| RangeError)?;
        if suffix == 0 {
            return Err(RangeError);
        }
        let start = total.saturating_sub(suffix);
        return Ok(Some(ByteRange {
            start,
            end: total - 1,
        }));
    }

    let start: u64 = start_str.parse().map_err(|_| RangeError)?;
    if start >= total {
        return Err(RangeError);
    }

    let end = if end_str.is_empty() {
        total - 1
    } else {
        let end: u64 = end_str.parse().map_err(|_| RangeError)?;
        if end < start {
            return Err(RangeError);
        }
        end.min(total - 1)
    };

    Ok(Some(ByteRange { start, end }))
}

/// Build a `206 Partial Content` response streaming the requested byte range.
pub fn partial_content_response(
    path: &std::path::Path,
    total: u64,
    range: ByteRange,
    content_type: &str,
) -> Response {
    let mut file = match std::fs::File::open(path) {
        Ok(f) => f,
        Err(_) => return StatusCode::NOT_FOUND.into_response(),
    };

    if file.seek(SeekFrom::Start(range.start)).is_err() {
        return StatusCode::INTERNAL_SERVER_ERROR.into_response();
    }

    let limited = file.take(range.len());
    let stream = ReaderStream::new(limited);

    let content_range = format!("bytes {}-{}/{}", range.start, range.end, total);

    let mut headers = HeaderMap::new();
    headers.insert(header::ACCEPT_RANGES, HeaderValue::from_static("bytes"));
    headers.insert(header::CONTENT_TYPE, HeaderValue::from_str(content_type).unwrap_or(HeaderValue::from_static("application/octet-stream")));
    headers.insert(header::CONTENT_LENGTH, HeaderValue::from(range.len()));
    if let Ok(v) = HeaderValue::from_str(&content_range) {
        headers.insert(header::CONTENT_RANGE, v);
    }

    (StatusCode::PARTIAL_CONTENT, headers, Body::from_stream(stream)).into_response()
}

/// Build a `416 Range Not Satisfiable` response with `Content-Range: bytes */<total>`.
pub fn range_not_satisfiable_response(total: u64) -> Response {
    let mut headers = HeaderMap::new();
    headers.insert(header::ACCEPT_RANGES, HeaderValue::from_static("bytes"));
    if let Ok(v) = HeaderValue::from_str(&format!("bytes */{}", total)) {
        headers.insert(header::CONTENT_RANGE, v);
    }
    (StatusCode::RANGE_NOT_SATISFIABLE, headers).into_response()
}

/// Build a full `200 OK` response advertising range support.
pub fn full_content_response(
    path: &std::path::Path,
    total: u64,
    content_type: &str,
) -> Response {
    let file = match std::fs::File::open(path) {
        Ok(f) => f,
        Err(_) => return StatusCode::NOT_FOUND.into_response(),
    };

    let stream = ReaderStream::new(file);

    let mut headers = HeaderMap::new();
    headers.insert(header::ACCEPT_RANGES, HeaderValue::from_static("bytes"));
    headers.insert(header::CONTENT_TYPE, HeaderValue::from_str(content_type).unwrap_or(HeaderValue::from_static("application/octet-stream")));
    headers.insert(header::CONTENT_LENGTH, HeaderValue::from(total));

    (StatusCode::OK, headers, Body::from_stream(stream)).into_response()
}

/// Serve a video file honoring the `Range` header.
///
/// - Valid range -> `206 Partial Content` with `Content-Range`.
/// - Invalid/unsatisfiable range -> `416 Range Not Satisfiable`.
/// - No range -> `200 OK` with `Accept-Ranges: bytes`.
pub fn serve_video(path: &std::path::Path, headers: &HeaderMap, content_type: &str) -> Response {
    let total = match std::fs::metadata(path) {
        Ok(m) => m.len(),
        Err(_) => return StatusCode::NOT_FOUND.into_response(),
    };

    let range_header = headers
        .get(header::RANGE)
        .and_then(|v| v.to_str().ok());

    match parse_range(range_header, total) {
        Ok(Some(range)) => partial_content_response(path, total, range, content_type),
        Ok(None) => full_content_response(path, total, content_type),
        Err(_) => range_not_satisfiable_response(total),
    }
}
