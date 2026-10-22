import type { MetadataRoute } from "next";

const base = (process.env.APP_URL?.trim() || "https://zoraxpilot.com").replace(/\/$/, "");

/** What crawlers may read: the public site. The CRM, the agent, the APIs and the onboarding stay out. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/dashboard", "/onboarding", "/jarvis", "/api/", "/auth/", "/dev/"] }],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
