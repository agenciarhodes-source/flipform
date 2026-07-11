import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import DomainsClient from "./domains-client";

export default async function DomainsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!can(session.role, "DOMAINS_VIEW")) redirect("/dashboard?error=permission-denied");

  return <DomainsClient />;
}
