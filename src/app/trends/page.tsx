import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import AppShell from "@/components/AppShell";
import TrendsView from "@/components/TrendsView";

export default async function TrendsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <AppShell active="trends">
      <TrendsView />
    </AppShell>
  );
}
