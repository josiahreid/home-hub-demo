import { originOf } from "@/lib/request";
import { buildFeed } from "@/lib/calendar-feed";

// One-off download of the same calendar the subscription link serves.
export async function GET(req: Request) {
  const ics = await buildFeed(originOf(req));
  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="home-hub.ics"',
    },
  });
}
