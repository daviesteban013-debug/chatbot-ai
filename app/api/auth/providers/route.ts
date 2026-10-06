import { NextResponse } from "next/server";

/** Supabase's public provider flags contain no credentials. Fail closed. */
export async function GET() {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) throw new Error("Auth unavailable");
    const response = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: key }, cache: "no-store", signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error("Auth unavailable");
    const settings = await response.json();
    return NextResponse.json({ google: settings.external?.google === true }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ google: false }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
