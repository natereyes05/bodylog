import Link from "next/link";
import SignOutButton from "@/components/SignOutButton";

export default function AppShell({
  active,
  children,
}: {
  active: "log" | "trends";
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-background/90 px-4 py-3 backdrop-blur">
        <span className="text-base font-semibold">BodyLog</span>
        <SignOutButton />
      </header>

      <div className="flex-1 pb-24">{children}</div>

      <nav className="fixed bottom-0 left-0 right-0 z-10 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto flex max-w-lg">
          <Link
            href="/log"
            className={`flex-1 py-3 text-center text-sm font-medium ${
              active === "log" ? "text-accent" : "text-muted"
            }`}
          >
            Today
          </Link>
          <Link
            href="/trends"
            className={`flex-1 py-3 text-center text-sm font-medium ${
              active === "trends" ? "text-accent" : "text-muted"
            }`}
          >
            Trends
          </Link>
        </div>
      </nav>
    </div>
  );
}
