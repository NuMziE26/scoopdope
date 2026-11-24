use std::collections::HashMap;
use std::time::{SystemTime, UNIX_EPOCH};

use hmac::{Hmac, Mac};
use sha2::Sha256;

use crate::error::AppError;

type HmacSha256 = Hmac<Sha256>;

/// Default lifetime for signed course media URLs (1 hour).
pub const DEFAULT_URL_TTL_SECS: u64 = 3600;

/// Configuration for the CDN used to serve course media assets.
#[derive(Debug, Clone)]
pub struct CdnConfig {
    /// Base URL of the CDN distribution, e.g. `https://cdn.example.com`.
    pub base_url: String,
    /// Shared secret used to sign URLs (CloudFront key / equivalent).
    pub signing_key: String,
    /// Key pair id / key name expected by the CDN provider.
    pub key_pair_id: String,
    /// Lifetime of signed URLs in seconds.
    pub url_ttl_secs: u64,
}

impl CdnConfig {
    pub fn new(
        base_url: impl Into<String>,
        signing_key: impl Into<String>,
        key_pair_id: impl Into<String>,
    ) -> Self {
        Self {
            base_url: base_url.into().trim_end_matches('/').to_string(),
            signing_key: signing_key.into(),
            key_pair_id: key_pair_id.into(),
            url_ttl_secs: DEFAULT_URL_TTL_SECS,
        }
    }
}

/// A signed, expiring CDN URL for a course media asset.
#[derive(Debug, Clone)]
pub struct SignedUrl {
    pub url: String,
    pub expires_at: u64,
}

/// Service responsible for producing signed CDN URLs for course media.
#[derive(Debug, Clone)]
pub struct CdnService {
    config: CdnConfig,
}

impl CdnService {
    pub fn new(config: CdnConfig) -> Self {
        Self { config }
    }

    /// Build a signed CDN URL for the given media path (e.g. `courses/42/video.mp4`).
    /// The URL expires after `config.url_ttl_secs` (1 hour by default).
    pub fn signed_url(&self, media_path: &str) -> Result<SignedUrl, AppError> {
        let path = media_path.trim_start_matches('/');
        let expires_at = now_secs() + self.config.url_ttl_secs;
        let signature = self.sign(path, expires_at)?;

        let url = format!(
            "{}/{path}?Expires={expires_at}&Signature={signature}&Key-Pair-Id={}",
            self.config.base_url, self.config.key_pair_id
        );

        Ok(SignedUrl { url, expires_at })
    }

    /// Verify a signed CDN URL. Returns `AppError::Forbidden` when the signature
    /// is invalid or the URL has expired (so expired URLs yield `403`).
    pub fn verify(&self, media_path: &str, expires_at: u64, signature: &str) -> Result<(), AppError> {
        if now_secs() > expires_at {
            return Err(AppError::Forbidden("CDN URL has expired".to_string()));
        }

        let path = media_path.trim_start_matches('/');
        let expected = self.sign(path, expires_at)?;
        if !constant_time_eq(expected.as_bytes(), signature.as_bytes()) {
            return Err(AppError::Forbidden("invalid CDN signature".to_string()));
        }

        Ok(())
    }

    fn sign(&self, path: &str, expires_at: u64) -> Result<String, AppError> {
        let mut mac = HmacSha256::new_from_slice(self.config.signing_key.as_bytes())
            .map_err(|e| AppError::Internal(format!("cdn signing key error: {e}")))?;
        mac.update(path.as_bytes());
        mac.update(b"\n");
        mac.update(expires_at.to_string().as_bytes());
        let digest = mac.finalize().into_bytes();
        Ok(hex_encode(&digest))
    }
}

fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

fn hex_encode(bytes: &[u8]) -> String {
    let mut out = String::with_capacity(bytes.len() * 2);
    for b in bytes {
        out.push_str(&format!("{b:02x}"));
    }
    out
}

fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    let mut diff = 0u8;
    for (x, y) in a.iter().zip(b.iter()) {
        diff |= x ^ y;
    }
    diff == 0
}

/// Resolve a map of course media assets to signed CDN URLs.
pub fn sign_course_media(
    service: &CdnService,
    assets: &HashMap<String, String>,
) -> Result<HashMap<String, SignedUrl>, AppError> {
    let mut signed = HashMap::with_capacity(assets.len());
    for (name, path) in assets {
        signed.insert(name.clone(), service.signed_url(path)?);
    }
    Ok(signed)
}
