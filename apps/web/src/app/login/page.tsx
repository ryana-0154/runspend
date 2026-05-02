import { signIn } from "@/auth";

export default function LoginPage() {
  async function signInWithGithub() {
    "use server";
    await signIn("github", { redirectTo: "/dashboard" });
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-2xl font-semibold">Sign in to runspend</h1>
      <p className="text-sm text-zinc-600">
        Connect your GitHub account to analyze your Actions spend.
      </p>
      <form action={signInWithGithub}>
        <button
          type="submit"
          className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
        >
          Sign in with GitHub
        </button>
      </form>
    </main>
  );
}
