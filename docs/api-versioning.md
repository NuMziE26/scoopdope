# API Versioning Policy

## Overview

The API uses **URI-based versioning** via NestJS's built-in `VersioningType.URI`. Every route is prefixed with a version segment, e.g. `/v1/courses`.

## How it works

- Versioning is enabled in `apps/api/src/main.ts` with `app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' })`.
- The default version is `1`, so existing `/v1/*` routes continue to resolve without changes.
- Every controller is annotated with `@Version('1')` to explicitly declare the version it serves.

## Requesting a version

Clients must include the version prefix in the URL:

```
GET /v1/courses
```

Requests to unsupported version prefixes (for example `GET /v3/courses`) return `404 Not Found`.

## Adding a new version

When a breaking change is required:

1. Create a new controller (or duplicate the affected handlers) annotated with `@Version('2')`.
2. Keep the existing `@Version('1')` controllers in place so current clients are not broken.
3. Both versions coexist under their respective prefixes (`/v1/...` and `/v2/...`).
4. Document the change and any deprecation timeline here.

## Deprecation

- Deprecated versions remain available until a documented sunset date.
- Clients are expected to migrate to the latest version before the sunset date.

## Out of scope

- Header-based (media type) versioning is not used.
- Creating a `v2` API is not part of the current strategy; this document only defines the mechanism.
