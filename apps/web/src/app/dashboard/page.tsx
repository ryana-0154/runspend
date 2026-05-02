import { auth } from "@/auth";

export default async function DashboardPage() {
  const session = await auth();
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <p className="text-sm text-zinc-600">
        Signed in as <span className="font-mono">{session?.user?.email ?? "unknown"}</span>
      </p>
    </main>
  );
}
