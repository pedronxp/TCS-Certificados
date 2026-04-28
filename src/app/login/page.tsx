import { redirect } from "next/navigation";
import { LoginForm } from "@/components/login-form";
import { getSessionUser } from "@/lib/auth";

export default async function LoginPage() {
  const user = await getSessionUser();
  if (user) redirect("/dashboard");

  return (
    <main className="grid min-h-screen place-items-center bg-slate-100 px-4 py-10 text-slate-950">
      <section className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-6">
          <div className="grid size-12 place-items-center rounded-lg bg-teal-700 text-lg font-bold text-white">TC</div>
          <h1 className="mt-5 text-2xl font-bold">Entrar no painel</h1>
          <p className="mt-1 text-sm text-slate-500">Use seu usuário para emitir e validar certificados.</p>
        </div>
        <LoginForm />
      </section>
    </main>
  );
}
