import { redirect } from "next/navigation";
import { getCurrentTenant } from "@/lib/auth";
import { WorkspaceView } from "./workspace-view";

export default async function WorkspacePage() {
  if (!await getCurrentTenant()) redirect("/login");
  return <WorkspaceView />;
}
