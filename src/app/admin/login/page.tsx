"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AdminLoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Erreur de connexion.");
        return;
      }
      router.push("/admin");
      router.refresh();
    } catch {
      setError("Impossible de joindre le serveur. Réessaie.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-pale flex items-center justify-center p-6 font-sans">
      <form
        onSubmit={handleSubmit}
        className="bg-white w-full max-w-sm border-t-4 border-vert-accent p-7"
      >
        <h1 className="font-display uppercase text-xl text-charbon mb-1">
          Gestion du stock JMM
        </h1>
        <p className="text-sm text-gray-500 mb-6">
          Connecte-toi pour gérer le catalogue et l&apos;inventaire.
        </p>

        <label className="block text-[11px] uppercase tracking-wide text-gray-500 font-bold mb-1.5">
          Nom d&apos;utilisateur
        </label>
        <input
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoFocus
          className="w-full border border-black/15 px-3 py-2.5 mb-4 text-sm"
        />

        <label className="block text-[11px] uppercase tracking-wide text-gray-500 font-bold mb-1.5">
          Mot de passe
        </label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full border border-black/15 px-3 py-2.5 mb-5 text-sm"
        />

        {error && <p className="text-sm text-rouge-non mb-4">{error}</p>}

        <button
          type="submit"
          disabled={loading || !username || !password}
          className="w-full bg-charbon text-white py-3 text-sm uppercase tracking-wide disabled:bg-gray-300 disabled:text-gray-500 hover:bg-vert-accent hover:text-charbon transition"
        >
          {loading ? "Connexion..." : "Se connecter"}
        </button>
      </form>
    </div>
  );
}
