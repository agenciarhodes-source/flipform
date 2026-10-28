const nextConfig = {
  output: 'standalone',
  images: {
    unoptimized: true,
  },
  // Next.js 15: moved out of "experimental".
  serverExternalPackages: ['mongodb'],
  webpack(config, { dev }) {
    if (dev) {
      // Reduce CPU/memory from file watching
      config.watchOptions = {
        poll: 2000, // check every 2 seconds
        aggregateTimeout: 300, // wait before rebuilding
        ignored: ['**/node_modules'],
      };
    }
    return config;
  },
  onDemandEntries: {
    maxInactiveAge: 10000,
    pagesBufferLength: 2,
  },
  async headers() {
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://connect.facebook.net https://www.googletagmanager.com https://tagmanager.google.com https://www.googleadservices.com https://www.google.com https://pagead2.googlesyndication.com https://googleads.g.doubleclick.net",
      "style-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://tagmanager.google.com https://fonts.googleapis.com",
      "img-src 'self' data: blob: https:",
      // Voice messages and audio replies are played from in-memory blobs created by the page.
      "media-src 'self' blob:",
      "font-src 'self' data: https://fonts.gstatic.com",
      "connect-src 'self' https:",
      "frame-src 'self' https://www.googletagmanager.com",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; ');

    // Security protocol S6: the signed-in areas (panel, Inbox, leads, settings, Super Admin) load
    // no third-party script, so they get a strict policy: only FlipForm's own scripts, no eval,
    // no plugins, no frames from other sites. Public forms and chat keep the policy above, because
    // they load each company's Google Tag Manager and Meta pixel; the Integrations screen keeps it
    // too, because the WhatsApp connection uses Facebook's SDK.
    const strictCsp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "img-src 'self' data: blob: https:",
      "media-src 'self' blob:",
      "font-src 'self' data: https://fonts.gstatic.com",
      "connect-src 'self' https:",
      "frame-src 'self'",
      "worker-src 'self' blob:",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      'upgrade-insecure-requests',
    ].join('; ');
    const STRICT_AREAS = [
      'account', 'automations', 'billing', 'customers', 'dashboard', 'domains', 'flip', 'flip-ai', 'forms',
      'group', 'inbox', 'kanban', 'leads', 'pipelines', 'reports', 'sales-rotation', 'team', 'users',
      'whatsapp-ai', 'whatsapp-funnel', 'admin',
    ];
    const strictRules = STRICT_AREAS.flatMap((area) => [
      { source: `/${area}`, headers: [{ key: 'Content-Security-Policy', value: strictCsp }] },
      { source: `/${area}/:path*`, headers: [{ key: 'Content-Security-Policy', value: strictCsp }] },
    ]);
    // Settings is strict too, except its Integrations page (same screen as /integrations).
    strictRules.push(
      { source: '/settings', headers: [{ key: 'Content-Security-Policy', value: strictCsp }] },
      { source: '/settings/:path((?!integrations).*)', headers: [{ key: 'Content-Security-Policy', value: strictCsp }] },
    );

    const commonHeaders = [
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
      { key: 'Content-Security-Policy', value: csp },
    ];

    return [
      {
        source: '/(.*)',
        headers: commonHeaders,
      },
      // Later rules override the policy above for the signed-in areas.
      ...strictRules,
      {
        // Voice is intentionally available only on the public Flip AI chat surface.
        source: '/chat/:path*',
        headers: [{ key: 'Permissions-Policy', value: 'camera=(), microphone=(self), geolocation=()' }],
      },
      {
        // The inbox records voice notes for WhatsApp; the rest of the app keeps the microphone off.
        source: '/inbox',
        headers: [{ key: 'Permissions-Policy', value: 'camera=(), microphone=(self), geolocation=()' }],
      },
      {
        source: '/inbox/:path*',
        headers: [{ key: 'Permissions-Policy', value: 'camera=(), microphone=(self), geolocation=()' }],
      },
      {
        source: '/(.*)',
        has: [{ type: 'header', key: 'x-forwarded-proto', value: 'https' }],
        headers: [{ key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains; preload' }],
      },
    ];
  },
};

module.exports = nextConfig;
