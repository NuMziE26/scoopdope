const { withSentryConfig } = require('@sentry/nextjs');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
};

module.exports = withSentryConfig(
  nextConfig,
  {
    // Suppress source map upload logs during build.
    silent: true,
    // Do not fail the build when Sentry auth token is absent (e.g. local dev).
    errorHandler: (err) => {
      // eslint-disable-next-line no-console
      console.warn('Sentry config warning:', err.message);
    },
  },
);
