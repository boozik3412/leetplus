import type { MetadataRoute } from "next";

// Only the public homepage is for search engines; the cabinet, guest game
// and login screens are not. `/$` = the homepage itself, not everything.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/$", "/landing/"],
      disallow: "/",
    },
    sitemap: "https://leetplus.ru/sitemap.xml",
  };
}
