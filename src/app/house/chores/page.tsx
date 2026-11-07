import { ChoreList } from "../chore-list";

export default async function ChoresPage({ searchParams }: PageProps<"/house/chores">) {
  const { view } = await searchParams;
  return <ChoreList kind="chore" view={view === "area" ? "area" : "due"} />;
}
