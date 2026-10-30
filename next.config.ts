import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Next.js normally streams dynamic metadata after </head>. Google Messages
  // uses the GoogleMessages fetcher and cannot rely on late body metadata.
  // Preserve the full Next.js default HTML-limited bot list when extending it.
  // Never block metadata for human browsers: gallery performance depends on it.
  htmlLimitedBots: /[\w-]+-Google|Google-[\w-]+|Chrome-Lighthouse|Slurp|DuckDuckBot|baiduspider|yandex|sogou|bitlybot|tumblr|vkShare|quora link preview|redditbot|ia_archiver|Bingbot|BingPreview|applebot|facebookexternalhit|facebookcatalog|Twitterbot|LinkedInBot|Slackbot|Discordbot|WhatsApp|SkypeUriPreview|Yeti|googleweblight|GoogleMessages|TelegramBot/i,
  outputFileTracingIncludes: {
    '/api/og/player-profile': [
      './chromium-bin/**/*',
    ],
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "yatstats-assets.s3.us-west-2.amazonaws.com" },
      { protocol: "https", hostname: "*.amazonaws.com" },
      { protocol: "https", hostname: "storage.googleapis.com" },
      { protocol: "https", hostname: "firebasestorage.googleapis.com" },
    ],
    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: 60 * 60 * 24 * 30,
  },
  async headers() {
    return [
      {
        source: "/img/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
      {
        source: "/:path*\\.(png|jpg|jpeg|gif|webp|avif|svg|ico|woff2|otf)",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
    ];
  },
};

export default nextConfig;
