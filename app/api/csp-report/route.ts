/**
 * Where browsers send Content Security Policy violations (the `report-uri` in lib/security-headers.ts).
 * Each report becomes one compact log line, so a blocked origin shows up in the Vercel logs instead of
 * silently breaking a page. Nothing is stored and nothing is echoed back.
 */
const MAX_BODY = 16_384;
const MAX_REPORTS = 5;
type Report = Record<string, unknown>;

export async function POST(request: Request) {
  const type = request.headers.get("content-type") ?? "";
  if (!/^application\/(csp-report|reports\+json|json)\b/.test(type)) return new Response(null, { status: 415 });
  const raw = (await request.text()).slice(0, MAX_BODY);
  let items: unknown[];
  try { const body: unknown = JSON.parse(raw); items = Array.isArray(body) ? body : [body]; }
  catch { return new Response(null, { status: 400 }); }
  for (const item of items.slice(0, MAX_REPORTS)) {
    const outer = asRecord(item) ?? {};
    // Legacy `report-uri` wraps the fields in `csp-report`; the Reporting API puts them in `body`.
    const report = asRecord(outer["csp-report"]) ?? asRecord(outer.body) ?? outer;
    console.warn("[csp]", JSON.stringify({
      directive: text(report["effective-directive"] ?? report.effectiveDirective ?? report["violated-directive"] ?? report.violatedDirective),
      blocked: text(report["blocked-uri"] ?? report.blockedURL),
      page: text(report["document-uri"] ?? report.documentURL),
      sample: text(report["script-sample"] ?? report.sample),
    }));
  }
  return new Response(null, { status: 204 });
}

function asRecord(value: unknown): Report | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Report : undefined;
}
function text(value: unknown): string {
  return typeof value === "string" ? value.slice(0, 200) : "";
}
