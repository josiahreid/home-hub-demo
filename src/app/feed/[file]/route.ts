import { originOf } from "@/lib/request";
import { buildFeed, tokenMatches } from "@/lib/calendar-feed";

// GET /feed/<secret>.ics – the subscribable Home Hub calendar.
export async function GET(req: Request, ctx: RouteContext<"/feed/[file]">) {
  const { file } = await ctx.params;
  const token = file.replace(/\.ics$/i, "");
  if (!tokenMatches(token)) return new Response("Not found", { status: 404 });

  const ics = await buildFeed(originOf(req));
  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="home-hub.ics"',
      "Cache-Control": "no-store",
    },
  });
}
