const { withSentryConfig } = require('@sentry/nextjs')

const isDevelopment = process.env.NODE_ENV === 'development'
const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN
const SENTRY_ORG = process.env.NEXT_PUBLIC_SENTRY_ORG
const SENTRY_PROJECT = process.env.NEXT_PUBLIC_SENTRY_PROJECT
const isHideSentry = isDevelopment || !SENTRY_DSN || !SENTRY_ORG || !SENTRY_PROJECT

const withMDX = require('@next/mdx')({
  extension: /\.mdx?$/,
  options: {
    // If you use remark-gfm, you'll need to use next.config.mjs
    // as the package is ESM only
    // https://github.com/remarkjs/remark-gfm#install
    remarkPlugins: [],
    rehypePlugins: [],
    // If you use `MDXProvider`, uncomment the following line.
    // providerImportSource: "@mdx-js/react",
  },
})

/** @type {import('next').NextConfig} */
const nextConfig = {
  productionBrowserSourceMaps: false, // enable browser source map generation during the production build
  // Configure pageExtensions to include md and mdx
  pageExtensions: ['ts', 'tsx', 'js', 'jsx', 'md', 'mdx'],
  experimental: {
    appDir: true,
  },
  // fix all before production. Now it slow the develop speed.
  eslint: {
    // Warning: This allows production builds to successfully complete even if
    // your project has ESLint errors.
    ignoreDuringBuilds: true,
  },
  typescript: {
    // https://nextjs.org/docs/api-reference/next.config.js/ignoring-typescript-errors
    ignoreBuildErrors: true,
  },
  async redirects() {
    return [
      {
        source: '/',
        destination: '/apps',
        permanent: false,
      },
    ]
  },
  ...(isHideSentry
    ? {}
    : {
      sentry: {
        hideSourceMaps: true,
      },
    }),
}

// https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup
const sentryWebpackPluginOptions = {
  org: SENTRY_ORG,
  project: SENTRY_PROJECT,
  silent: true, // Suppresses all logs
  sourcemaps: {
    assets: './**',
    ignore: ['./node_modules/**'],
  },
  // https://github.com/getsentry/sentry-webpack-plugin#options.
}

module.exports = isHideSentry ? withMDX(nextConfig) : withMDX(withSentryConfig(nextConfig, sentryWebpackPluginOptions))
