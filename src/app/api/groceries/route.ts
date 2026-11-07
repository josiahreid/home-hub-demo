import { addGrocery, clearGroceryByName, groceryList, groceryText, groceryTokenMatches } from "@/lib/groceries";

/**
 * The grocery list for Apple Shortcuts (and NFC tag automations). Every request carries the secret key from
 * Food → Grocery list → Apple Shortcuts, as ?key=… in the link.
 *
 *   GET  /api/groceries?key=…               the list as text (urgent, then not urgent)
 *   GET  /api/groceries?key=…&format=json   the list as JSON
 *   POST /api/groceries?key=…               add: JSON {"item": "Milk", "urgent": true}, or ?item=Milk&urgent=1
 *   POST /api/groceries?key=…&clear=Milk    tick an item off
 */

function refused() {
  return new Response("Wrong or missing key – copy the link again from Food → Grocery list.", { status: 401 });
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  if (!groceryTokenMatches(url.searchParams.get("key"))) return refused();
  if (url.searchParams.get("format") === "json") {
    const { urgent, notUrgent } = groceryList();
    return Response.json({ urgent: urgent.map((i) => i.name), notUrgent: notUrgent.map((i) => i.name) });
  }
  return new Response(groceryText(), { headers: { "content-type": "text/plain; charset=utf-8" } });
}

export async function POST(req: Request) {
  const url = new URL(req.url);
  if (!groceryTokenMatches(url.searchParams.get("key"))) return refused();

  const clear = url.searchParams.get("clear");
  if (clear) {
    const found = clearGroceryByName(clear);
    return new Response(found ? `Ticked off ${clear}.` : `${clear} wasn't on the list.`, { headers: { "content-type": "text/plain; charset=utf-8" } });
  }

  // Shortcuts sends JSON or a form; a plain ?item= in the link works too
  let item = url.searchParams.get("item") ?? "";
  let urgent = ["1", "true", "yes", "urgent"].includes((url.searchParams.get("urgent") ?? "").toLowerCase());
  const type = req.headers.get("content-type") ?? "";
  try {
    if (type.includes("json")) {
      const body = (await req.json()) as { item?: unknown; urgent?: unknown };
      if (typeof body.item === "string") item = body.item;
      if (body.urgent !== undefined) urgent = body.urgent === true || ["1", "true", "yes", "urgent"].includes(String(body.urgent).toLowerCase());
    } else if (type.includes("form")) {
      const fd = await req.formData();
      item = String(fd.get("item") ?? item);
      if (fd.has("urgent")) urgent = ["1", "true", "yes", "urgent", "on"].includes(String(fd.get("urgent")).toLowerCase());
    }
  } catch {
    return new Response("Couldn't read that – send {\"item\": \"Milk\", \"urgent\": true}.", { status: 400 });
  }

  // one request can add several, separated by commas or new lines ("milk, bread")
  const names = item.split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
  if (!names.length) return new Response("Nothing to add – send an item name.", { status: 400 });
  const added: string[] = [];
  const already: string[] = [];
  for (const n of names) (addGrocery(n, urgent)?.added ? added : already).push(n);
  const msg = [
    added.length ? `Added ${added.join(", ")}${urgent ? " (urgent)" : ""}.` : "",
    already.length ? `${already.join(", ")} ${already.length === 1 ? "was" : "were"} already on the list${urgent ? " – now urgent" : ""}.` : "",
  ].filter(Boolean).join(" ");
  return new Response(msg, { headers: { "content-type": "text/plain; charset=utf-8" } });
}
