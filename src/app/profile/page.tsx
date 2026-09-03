import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import AppShell from "@/components/AppShell";
import ProfileView from "@/components/ProfileView";

export default async function ProfilePage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <AppShell active="profile">
      <ProfileView />
    </AppShell>
  );
}
