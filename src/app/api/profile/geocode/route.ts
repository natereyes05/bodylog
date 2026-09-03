import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

interface NominatimAddress {
  city?: string;
  town?: string;
  village?: string;
  hamlet?: string;
  county?: string;
  state?: string;
  state_district?: string;
  country?: string;
}

interface NominatimResponse {
  address?: NominatimAddress;
  display_name?: string;
}

/**
 * Reverse-geocodes browser-supplied coordinates into a short "City, State"
 * string via OpenStreetMap's free Nominatim service. Proxied through our
 * own backend (rather than calling Nominatim directly from the browser) so
 * we can set the identifying User-Agent header Nominatim's usage policy
 * requires — browsers won't let client-side fetch() override that header.
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const lat = Number(body?.lat);
  const lng = Number(body?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: "Invalid coordinates." }, { status: 400 });
  }

  try {
    const url = new URL("https://nominatim.openstreetmap.org/reverse");
    url.searchParams.set("lat", String(lat));
    url.searchParams.set("lon", String(lng));
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("zoom", "10");

    const res = await fetch(url.toString(), {
      headers: { "User-Agent": "BodyLog/1.0 (personal nutrition tracker)" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      return NextResponse.json({ error: "Couldn't determine your location." }, { status: 502 });
    }

    const data = (await res.json()) as NominatimResponse;
    const address = data.address ?? {};
    const locality = address.city ?? address.town ?? address.village ?? address.hamlet ?? address.county;
    const region = address.state ?? address.state_district ?? address.country;

    const locationHint = [locality, region].filter(Boolean).join(", ") || data.display_name;
    if (!locationHint) {
      return NextResponse.json({ error: "Couldn't determine your location." }, { status: 502 });
    }

    return NextResponse.json({ locationHint });
  } catch {
    return NextResponse.json({ error: "Location lookup timed out or failed." }, { status: 502 });
  }
}
