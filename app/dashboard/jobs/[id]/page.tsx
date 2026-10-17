import { notFound, redirect } from "next/navigation";
import { getCurrentTenant } from "@/lib/auth";
import { JobDetail } from "@/components/dashboard/job-detail";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function JobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tenant = await getCurrentTenant();
  if (!tenant) redirect("/login");
  if (!UUID.test(id)) notFound();
  return <JobDetail id={id.toLowerCase()} canWrite={tenant.role !== "viewer"} />;
}
