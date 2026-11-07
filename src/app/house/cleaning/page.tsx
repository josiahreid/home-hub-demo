import { ChoreList } from "../chore-list";

export default async function CleaningPage({ searchParams }: PageProps<"/house/cleaning">) {
  const { view } = await searchParams;
  return <ChoreList kind="cleaning" view={view === "area" ? "area" : "due"} />;
}
