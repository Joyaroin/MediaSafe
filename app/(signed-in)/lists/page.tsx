import { redirect } from "next/navigation";

/**
 * `/lists` — a redirect to Library's Lists tab, since the UI overhaul.
 *
 * It rendered the same `ListsPanel` the Library → Lists tab renders, under its own `Lists`
 * heading, and nothing in the app linked to it: a second copy of one surface reachable only
 * by typing the address. It stays as a route so an old bookmark lands somewhere, and the
 * somewhere is the one copy. A list's own page (`/lists/[listId]`) is unaffected.
 */
export default function ListsPage(): never {
  redirect("/library?view=lists");
}
