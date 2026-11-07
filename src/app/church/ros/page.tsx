import { io } from "next/cache";
import { PersonTab } from "../person-tab";

export default async function RosChurch() {
  await io();
  return <PersonTab person="Default Name 2" />;
}
