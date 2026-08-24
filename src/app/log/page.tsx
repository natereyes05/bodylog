import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import AppShell from "@/components/AppShell";
import Dashboard from "@/components/Dashboard";

export default async function LogPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <AppShell active="log">
      <Dashboard userName={session?.user?.name ?? null} />
    </AppShell>
  );
}
