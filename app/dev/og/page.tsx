import { notFound } from "next/navigation";
import { OgFrame } from "./og-frame";

/**
 * Local fixture of the image shown when someone shares a Zorax link. To refresh it, capture this
 * page at 1200×630 into app/opengraph-image.jpg.
 */
export default function Page() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <OgFrame />;
}
