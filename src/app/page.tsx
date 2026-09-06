"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

// One orchestrated hero moment, grounded in the product itself: a radar
// sweep with four pulsing signals colored fact/hypothesis/conflict/unknown
// — literally "detecting signals amid noise," which is what the product
// actually does. Everything else on the page stays quiet and disciplined
// around that one moment, per the design brief.
function RadarHero() {
  const signals = [
    { cx: 62, cy: 38, color: "var(--fact)", delay: "0s" },
    { cx: 30, cy: 65, color: "var(--hypothesis)", delay: "0.6s" },
    { cx: 75, cy: 72, color: "var(--conflict)", delay: "1.2s" },
    { cx: 45, cy: 20, color: "var(--unknown)", delay: "1.8s" },
  ];

  return (
    <div className="relative w-full max-w-[420px] aspect-square mx-auto">
      <svg viewBox="0 0 100 100" className="w-full h-full">
        {[18, 32, 46].map((r) => (
          <circle
            key={r}
            cx="50"
            cy="50"
            r={r}
            fill="none"
            stroke="var(--panel-border)"
            strokeWidth="0.4"
          />
        ))}
        <line x1="50" y1="4" x2="50" y2="96" stroke="var(--panel-border)" strokeWidth="0.3" />
        <line x1="4" y1="50" x2="96" y2="50" stroke="var(--panel-border)" strokeWidth="0.3" />

        <g style={{ transformOrigin: "50px 50px" }} className="radar-sweep">
          <path d="M 50 50 L 50 4 A 46 46 0 0 1 88.8 27.4 Z" fill="url(#sweepGradient)" />
        </g>
        <defs>
          <linearGradient id="sweepGradient" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--fact)" stopOpacity="0.35" />
            <stop offset="100%" stopColor="var(--fact)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {signals.map((s, i) => (
          <circle
            key={i}
            cx={s.cx}
            cy={s.cy}
            r="2.2"
            fill={s.color}
            className="radar-blip"
            style={{ animationDelay: s.delay }}
          />
        ))}
      </svg>
      <style>{`
        .radar-sweep {
          animation: sweep 4s linear infinite;
        }
        .radar-blip {
          animation: blip 2.4s ease-in-out infinite;
        }
        @keyframes sweep {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes blip {
          0%, 100% { opacity: 0.25; r: 2.2; }
          50% { opacity: 1; r: 3; }
        }
        @media (prefers-reduced-motion: reduce) {
          .radar-sweep, .radar-blip { animation: none; }
        }
      `}</style>
    </div>
  );
}

export default function Landing() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [wantsSummaryEmail, setWantsSummaryEmail] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !email.trim()) {
      setError("Name and email are both needed to enter the room.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name.trim(), email: email.trim(), wantsSummaryEmail }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "registration failed");
      sessionStorage.setItem("echosphere_name", name.trim());
      router.push("/room");
    } catch (err) {
      setError(err instanceof Error ? err.message : "something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 py-16">
      <RadarHero />

      <div className="text-center mt-6 mb-10 max-w-md">
        <p className="mono text-xs mb-2" style={{ color: "var(--text-dim)" }}>
          ECHOSPHERE
        </p>
        <h1 className="text-3xl font-semibold tracking-tight mb-3">
          A voice-native AI Incident Commander
        </h1>
        <p className="text-sm leading-relaxed" style={{ color: "var(--text-dim)" }}>
          It joins your incident call, listens, and keeps a live record of what's confirmed,
          what's suspected, and what's still unresolved — while your team stays in control of
          every consequential action.
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-md border p-6 flex flex-col gap-4"
        style={{ borderColor: "var(--panel-border)", background: "var(--panel)" }}
      >
        <div className="flex flex-col gap-1.5">
          <label className="mono text-xs" style={{ color: "var(--text-dim)" }}>
            Your name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Alex"
            className="text-sm rounded border bg-transparent px-3 py-2 focus:outline-none focus:ring-1"
            style={{ borderColor: "var(--panel-border)" }}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="mono text-xs" style={{ color: "var(--text-dim)" }}>
            Email
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="alex@company.com"
            className="text-sm rounded border bg-transparent px-3 py-2 focus:outline-none focus:ring-1"
            style={{ borderColor: "var(--panel-border)" }}
          />
        </div>

        <label className="flex items-start gap-2 text-xs leading-relaxed" style={{ color: "var(--text-dim)" }}>
          <input
            type="checkbox"
            checked={wantsSummaryEmail}
            onChange={(e) => setWantsSummaryEmail(e.target.checked)}
            className="mt-0.5"
          />
          Email me the incident summary when this call ends
        </label>

        {error && (
          <p className="text-xs" style={{ color: "var(--conflict)" }}>
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="mono text-xs rounded px-4 py-2.5 font-medium disabled:opacity-50"
          style={{ background: "var(--fact)", color: "#0c1015" }}
        >
          {submitting ? "entering…" : "Enter the incident room"}
        </button>
      </form>
    </main>
  );
}
