import { redirect } from "next/navigation";
import { getCurrentTenant } from "@/lib/auth";
import { JobsView } from "@/components/dashboard/jobs-view";

export default async function JobsPage() {
  const tenant = await getCurrentTenant();
  if (!tenant) redirect("/login");
  return <JobsView canWrite={tenant.role !== "viewer"} />;
}
