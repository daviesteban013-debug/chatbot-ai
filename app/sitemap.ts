import type { MetadataRoute } from "next";

const base = (process.env.APP_URL?.trim() || "https://zoraxpilot.com").replace(/\/$/, "");

/** The public pages, for Google Search Console. Everything behind a session is left out on purpose. */
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return [
    { url: `${base}/`, lastModified, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/signup`, lastModified, changeFrequency: "monthly", priority: 0.8 },
    { url: `${base}/login`, lastModified, changeFrequency: "monthly", priority: 0.5 },
    { url: `${base}/privacidad`, lastModified, changeFrequency: "yearly", priority: 0.3 },
  ];
}
