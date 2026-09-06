"use client";

import { useEffect, useRef, useState } from "react";
import { IncidentState, IncidentSummary, ActionStatus } from "@/lib/types";
import type { IAgoraRTCClient, IMicrophoneAudioTrack, IRemoteAudioTrack } from "agora-rtc-sdk-ng";

const emptyState: IncidentState = {
  status: "investigating",
  facts: [],
  hypotheses: [],
  conflicts: [],
  unknowns: [],
  actions: [],
  decisions: [],
  timeline: [],
  participants: [],
};

const SPEAKERS = ["Alex", "Maya", "Jordan", "You"];

function Panel({
  title,
  accent,
  count,
  children,
}: {
  title: string;
  accent: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <div
      className="rounded-md border p-4 flex flex-col gap-3 min-h-[140px]"
      style={{ borderColor: "var(--panel-border)", background: "var(--panel)" }}
    >
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium tracking-tight" style={{ color: accent }}>
          {title}
        </h2>
        <span className="mono text-xs" style={{ color: "var(--text-dim)" }}>
          {count}
        </span>
      </div>
      <div className="flex flex-col gap-2 text-sm">
        {count === 0 ? (
          <p className="mono text-xs" style={{ color: "var(--text-dim)" }}>
            — none yet —
          </p>
        ) : (
          children
        )}
      </div>
    </div>
  );
}

const statusColor: Record<ActionStatus, string> = {
  proposed: "var(--hypothesis)",
  assigned: "var(--unknown)",
  in_progress: "var(--unknown)",
  done: "var(--fact)",
};

export default function Home() {
  const [state, setState] = useState<IncidentState>(emptyState);
  const [speaker, setSpeaker] = useState(SPEAKERS[0]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [lastSpeech, setLastSpeech] = useState<string | null>(null);
  const [summary, setSummary] = useState<IncidentSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
    const [emailLoading, setEmailLoading] = useState(false);
  const [emailResult, setEmailResult] = useState<string | null>(null);

  // --- Voice room state ---
  const [isJoined, setIsJoined] = useState(false);
  const [channelName, setChannelName] = useState("checkout-incident-room");
  const [voiceLoading, setVoiceLoading] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [agentSpeaking, setAgentSpeaking] = useState(false);

  const rtcClientRef = useRef<IAgoraRTCClient | null>(null);
  const micTrackRef = useRef<IMicrophoneAudioTrack | null>(null);
  const agentIdRef = useRef<string | null>(null);

  const logEndRef = useRef<HTMLDivElement>(null);

    async function refresh() {
    // Wrapped in try/catch: without this, a single failed fetch throws an
    // unhandled rejection inside the interval callback, and the polling
    // silently stops for the rest of the session — which looks exactly
    // like "the dashboard never updates" even though the server has the
    // data. Now one bad request is skipped and the next tick tries again.
    try {
      const res = await fetch(`/api/state?t=${Date.now()}`, { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      if (data?.state) setState(data.state);
    } catch (err) {
      console.error("[refresh] poll failed, will retry next tick", err);
    }
  }

  useEffect(() => {
    refresh();
    // 1500ms, matching the recommended cadence — fast enough that boxes
    // fill while someone is still talking.
    const interval = setInterval(() => {
      void refresh();
    }, 1500);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [state.timeline.length]);

  // Clean up mic/RTC connection if the user navigates away mid-call.
  useEffect(() => {
    return () => {
      micTrackRef.current?.close();
      rtcClientRef.current?.leave();
    };
  }, []);

  // --- Real Agora voice join ---
  async function joinVoiceRoom() {
    setVoiceLoading(true);
    setVoiceError(null);
    try {
      // agora-rtc-sdk-ng touches `window` at import time, so it must be
      // dynamically imported inside a browser-only code path — never as
      // a static top-level import, or the server-side render will crash.
      const AgoraRTC = (await import("agora-rtc-sdk-ng")).default;

      // 1. Get a real signed token for this browser tab.
      const tokenRes = await fetch("/api/agora/token", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ channel: channelName }),
      });
      const tokenData = await tokenRes.json();
      if (!tokenRes.ok) throw new Error(tokenData.error || "failed to get token");
      const { token, uid, appId } = tokenData;

      // 2. Join the RTC channel and publish the mic.
      const client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });
      rtcClientRef.current = client;

      client.on("user-published", async (user, mediaType) => {
        await client.subscribe(user, mediaType);
        if (mediaType === "audio") {
          const remoteAudioTrack = user.audioTrack as IRemoteAudioTrack;
          remoteAudioTrack.play();
          setAgentSpeaking(true);
        }
      });
      client.on("user-unpublished", (_user, mediaType) => {
        if (mediaType === "audio") setAgentSpeaking(false);
      });

      await client.join(appId, channelName, token, uid);

      const micTrack = await AgoraRTC.createMicrophoneAudioTrack();
      micTrackRef.current = micTrack;
      await client.publish([micTrack]);

      // 3. Now that a human is actually in the channel with a mic live,
      // invite the AI agent to join the same channel.
      const startRes = await fetch("/api/agora/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ channel: channelName }),
      });
      const startData = await startRes.json();
      if (!startRes.ok) throw new Error(startData.error || "failed to start agent");
      agentIdRef.current = startData.agent_id;

      setIsJoined(true);
    } catch (err) {
      console.error(err);
      setVoiceError(err instanceof Error ? err.message : "failed to join voice room");
      // best-effort cleanup on partial failure
      micTrackRef.current?.close();
      await rtcClientRef.current?.leave().catch(() => {});
      micTrackRef.current = null;
      rtcClientRef.current = null;
    } finally {
      setVoiceLoading(false);
    }
  }

  async function leaveVoiceRoom() {
    setVoiceLoading(true);
    try {
      if (agentIdRef.current) {
        await fetch("/api/agora/stop", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ agentId: agentIdRef.current }),
        });
        agentIdRef.current = null;
      }
      micTrackRef.current?.close();
      micTrackRef.current = null;
      await rtcClientRef.current?.leave();
      rtcClientRef.current = null;
      setIsJoined(false);
      setAgentSpeaking(false);
    } catch (err) {
      console.error(err);
      setVoiceError(err instanceof Error ? err.message : "failed to leave cleanly");
    } finally {
      setVoiceLoading(false);
    }
  }

  async function submitLine(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || busy) return;
    setBusy(true);
    const line = text;
    setText("");
    try {
      const res = await fetch("/api/ingest", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ speaker, text: line }),
      });
      const data = await res.json();
      if (data.state) setState(data.state);
      if (data.extraction?.aiShouldSpeak && data.extraction?.aiSpeech) {
        setLastSpeech(data.extraction.aiSpeech);
      }
    } finally {
      setBusy(false);
    }
  }

  async function approve(actionId: string) {
    const res = await fetch("/api/actions/approve", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ actionId }),
    });
    const data = await res.json();
    if (data.state) setState(data.state);
  }

  async function reset() {
    const res = await fetch("/api/reset", { method: "POST" });
    const data = await res.json();
    setState(data.state);
    setLastSpeech(null);
    setSummary(null);
  }

  async function generateSummary() {
    setSummaryLoading(true);
    try {
      const res = await fetch("/api/summary");
      const data = await res.json();
      if (data.summary) setSummary(data.summary);
    } finally {
      setSummaryLoading(false);
    }
  }


    async function emailSummary() {
    setEmailLoading(true);
    setEmailResult(null);
    try {
      const res = await fetch("/api/summary/email", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "failed to send");
      if (data.summary) setSummary(data.summary);
      if (data.skipped) {
        setEmailResult("No one opted in to receive the summary by email.");
      } else {
        setEmailResult(
          `Sent to ${data.sent.length} recipient${data.sent.length === 1 ? "" : "s"}` +
            (data.failed.length ? `, ${data.failed.length} failed` : "")
        );
      }
    } catch (err) {
      setEmailResult(err instanceof Error ? err.message : "failed to send");
    } finally {
      setEmailLoading(false);
    }
  }

  function summaryToMarkdown(s: IncidentSummary): string {
    const section = (title: string, items: string[]) =>
      items.length ? `## ${title}\n${items.map((i) => `- ${i}`).join("\n")}\n\n` : "";
    return (
      `# Incident Summary\n\n${s.impact}\n\n` +
      section("What we know", s.confirmedFacts) +
      section("What we suspect", s.hypotheses) +
      section("Conflicting evidence", s.conflictingEvidence) +
      section("Actions taken", s.actionsTaken) +
      section("Decisions", s.decisions) +
      section("Unresolved / still unknown", s.unresolvedRisks)
    );
  }

  function exportMarkdown() {
    if (!summary) return;
    const blob = new Blob([summaryToMarkdown(summary)], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "incident-summary.md";
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportPdf() {
    window.print();
  }

  async function resolveConflict(conflictId: string) {
    const note = window.prompt("Optional: what resolved this? (leave blank to skip)");
    const res = await fetch("/api/conflicts/resolve", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ conflictId, resolutionNote: note || undefined }),
    });
    const data = await res.json();
    if (data.state) setState(data.state);
  }

  return (
    <main className="min-h-screen p-6 lg:p-10 max-w-[1400px] mx-auto">
      <header className="flex items-start justify-between mb-8 gap-4 flex-wrap no-print">
        <div>
          <p className="mono text-xs mb-1" style={{ color: "var(--text-dim)" }}>
            ECHOSPHERE / INCIDENT ROOM
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">Incident Commander</h1>
          <p className="text-sm mt-1" style={{ color: "var(--text-dim)" }}>
            The AI organizes evidence and uncertainty. It does not manufacture certainty.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span
            className="mono text-xs px-2 py-1 rounded border"
            style={{
              borderColor: "var(--panel-border)",
              color: state.status === "investigating" ? "var(--hypothesis)" : "var(--fact)",
            }}
          >
            {state.status.toUpperCase()}
          </span>
                    <button
            onClick={refresh}
            className="mono text-xs px-3 py-1 rounded border hover:opacity-80"
            style={{ borderColor: "var(--unknown)", color: "var(--unknown)" }}
          >
            ↻ refresh now
          </button>
          <button
            onClick={reset}
            className="mono text-xs px-3 py-1 rounded border hover:opacity-80"
            style={{ borderColor: "var(--panel-border)", color: "var(--text-dim)" }}
          >
            reset demo
          </button>
                    <button
            onClick={generateSummary}
            disabled={summaryLoading}
            className="mono text-xs px-3 py-1 rounded border hover:opacity-80 disabled:opacity-40"
            style={{ borderColor: "var(--fact)", color: "var(--fact)" }}
          >
            {summaryLoading ? "writing…" : "final summary"}
          </button>
        </div>
      </header>

      {lastSpeech && (
        <div
          className="mb-6 rounded-md border px-4 py-3 text-sm flex items-center gap-3 no-print"
          style={{ borderColor: "var(--conflict)", background: "rgba(239,108,92,0.08)" }}
        >
          <span className="mono text-xs" style={{ color: "var(--conflict)" }}>
            AI SPEAKS
          </span>
          <span>{lastSpeech}</span>
        </div>
      )}

      {summary && (
        <div
          className="mb-6 rounded-md border p-5 grid grid-cols-1 md:grid-cols-2 gap-5"
          style={{ borderColor: "var(--fact)", background: "rgba(79,209,165,0.06)" }}
        >
          <div className="md:col-span-2 flex items-start justify-between gap-4 flex-wrap">
            <div>
              <p className="mono text-xs mb-1" style={{ color: "var(--fact)" }}>
                FINAL INCIDENT SUMMARY
              </p>
              <p className="text-sm">{summary.impact}</p>
            </div>
                        <div className="flex gap-2 no-print shrink-0 items-center flex-wrap">
              <button
                onClick={exportMarkdown}
                className="mono text-xs px-2 py-1 rounded border hover:opacity-80"
                style={{ borderColor: "var(--panel-border)", color: "var(--text-dim)" }}
              >
                export .md
              </button>
              <button
                onClick={exportPdf}
                className="mono text-xs px-2 py-1 rounded border hover:opacity-80"
                style={{ borderColor: "var(--panel-border)", color: "var(--text-dim)" }}
              >
                save as pdf
              </button>
              <button
                onClick={emailSummary}
                disabled={emailLoading}
                className="mono text-xs px-2 py-1 rounded border hover:opacity-80 disabled:opacity-40"
                style={{ borderColor: "var(--unknown)", color: "var(--unknown)" }}
              >
                {emailLoading ? "sending…" : "email to team"}
              </button>
              {emailResult && (
                <span className="mono text-xs" style={{ color: "var(--text-dim)" }}>
                  {emailResult}
                </span>
              )}
            </div>
          </div>
          {([
            ["What we know", summary.confirmedFacts, "var(--fact)"],
            ["What we suspect", summary.hypotheses, "var(--hypothesis)"],
            ["Conflicting evidence", summary.conflictingEvidence, "var(--conflict)"],
            ["Actions taken", summary.actionsTaken, "var(--text)"],
            ["Decisions", summary.decisions, "var(--unknown)"],
            ["Unresolved / still unknown", summary.unresolvedRisks, "var(--conflict)"],
          ] as [string, string[], string][]).map(([label, items, color]) =>
            items.length > 0 ? (
              <div key={label}>
                <p className="mono text-xs mb-1" style={{ color }}>
                  {label.toUpperCase()}
                </p>
                <ul className="text-sm flex flex-col gap-1">
                  {items.map((it, i) => (
                    <li key={i}>{it}</li>
                  ))}
                </ul>
              </div>
            ) : null
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-6 no-print">
        <div className="flex flex-col gap-4">
          {/* Real Agora voice room */}
          <div
            className="rounded-md border p-4 flex flex-col gap-3"
            style={{ borderColor: "var(--fact)", background: "var(--panel)" }}
          >
            <p className="mono text-xs" style={{ color: "var(--fact)" }}>
              🎙️ AGORA LIVE INCIDENT VOICE ROOM
            </p>
            <label className="mono text-xs" style={{ color: "var(--text-dim)" }}>
              ROOM NAME / CHANNEL
            </label>
            <input
              type="text"
              value={channelName}
              onChange={(e) => setChannelName(e.target.value)}
              disabled={isJoined}
              className="text-sm rounded border bg-transparent px-2 py-1 focus:outline-none"
              style={{ borderColor: "var(--panel-border)" }}
            />
            <button
              onClick={isJoined ? leaveVoiceRoom : joinVoiceRoom}
              disabled={voiceLoading}
              className="mono text-xs rounded px-3 py-2 font-medium transition-all disabled:opacity-50"
              style={{ background: isJoined ? "var(--conflict)" : "var(--fact)", color: "#0c1015" }}
            >
              {voiceLoading
                ? "connecting…"
                : isJoined
                ? "🔴 DISCONNECT / LEAVE ROOM"
                : "🟢 JOIN AGORA VOICE CHANNEL"}
            </button>
            {isJoined && (
              <p className="mono text-xs" style={{ color: agentSpeaking ? "var(--fact)" : "var(--text-dim)" }}>
                {agentSpeaking ? "● agent audio live" : "○ mic connected, agent joining…"}
              </p>
            )}
            {voiceError && (
              <p className="text-xs" style={{ color: "var(--conflict)" }}>
                {voiceError}
              </p>
            )}
            <p className="text-[11px] leading-relaxed" style={{ color: "var(--text-dim)" }}>
              {isJoined
                ? "Your mic is live in the channel and the AI agent has been invited in."
                : "Requests mic permission, joins the Agora channel, then invites the AI agent in."}
            </p>
          </div>

          <form
            onSubmit={submitLine}
            className="rounded-md border p-4 flex flex-col gap-3"
            style={{ borderColor: "var(--panel-border)", background: "var(--panel)" }}
          >
            <p className="mono text-xs" style={{ color: "var(--text-dim)" }}>
              SIMULATE TRANSCRIPT LINE (FALLBACK)
            </p>
            <select
              value={speaker}
              onChange={(e) => setSpeaker(e.target.value)}
              className="mono text-sm rounded border bg-transparent px-2 py-1"
              style={{ borderColor: "var(--panel-border)" }}
            >
              {SPEAKERS.map((s) => (
                <option key={s} value={s} style={{ background: "var(--panel)" }}>
                  {s}
                </option>
              ))}
            </select>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder='e.g. "I think the payment provider is down"'
              rows={3}
              className="text-sm rounded border bg-transparent px-2 py-2 resize-none focus:outline-none focus:ring-1"
              style={{ borderColor: "var(--panel-border)" }}
            />
            <button
              type="submit"
              disabled={busy}
              className="mono text-xs rounded px-3 py-2 disabled:opacity-40"
              style={{ background: "var(--conflict)", color: "#0c1015" }}
            >
              {busy ? "processing…" : "send line"}
            </button>
          </form>

          <div
            className="rounded-md border p-4 flex flex-col gap-2 flex-1 min-h-[250px]"
            style={{ borderColor: "var(--panel-border)", background: "var(--panel)" }}
          >
            <p className="mono text-xs mb-1" style={{ color: "var(--text-dim)" }}>
              TIMELINE
            </p>
            <div className="flex flex-col gap-1 overflow-y-auto max-h-[420px] pr-1">
              {state.timeline.length === 0 && (
                <p className="mono text-xs" style={{ color: "var(--text-dim)" }}>
                  — no events yet —
                </p>
              )}
              {state.timeline.map((t) => (
                <div key={t.id} className="text-xs flex gap-2">
                  <span className="mono" style={{ color: "var(--text-dim)" }}>
                    {new Date(t.timestamp).toLocaleTimeString()}
                  </span>
                  <span>{t.label}</span>
                </div>
              ))}
              <div ref={logEndRef} />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 content-start">
          <Panel title="Facts" accent="var(--fact)" count={state.facts.length}>
            {state.facts.map((f) => (
              <div key={f.id}>
                <span>{f.text}</span>
                <span className="mono text-xs block" style={{ color: "var(--text-dim)" }}>
                  — {f.source}
                </span>
              </div>
            ))}
          </Panel>

          <Panel title="Hypotheses" accent="var(--hypothesis)" count={state.hypotheses.length}>
            {state.hypotheses.map((h) => (
              <div key={h.id}>
                <span>{h.text}</span>
                <span className="mono text-xs block" style={{ color: "var(--text-dim)" }}>
                  — {h.source}
                </span>
              </div>
            ))}
          </Panel>

          <Panel
            title="Conflicts"
            accent="var(--conflict)"
            count={state.conflicts.filter((c) => !c.resolved).length}
          >
            {state.conflicts.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-2">
                <span
                  style={
                    c.resolved
                      ? { color: "var(--text-dim)", textDecoration: "line-through" }
                      : undefined
                  }
                >
                  {c.description}
                </span>
                {!c.resolved && (
                  <button
                    onClick={() => resolveConflict(c.id)}
                    className="mono text-xs px-2 py-1 rounded border hover:opacity-80 shrink-0"
                    style={{ borderColor: "var(--conflict)", color: "var(--conflict)" }}
                  >
                    resolve
                  </button>
                )}
              </div>
            ))}
          </Panel>

          <Panel
            title="Unknowns"
            accent="var(--unknown)"
            count={state.unknowns.filter((u) => !u.resolved).length}
          >
            {state.unknowns
              .filter((u) => !u.resolved)
              .map((u) => (
                <div key={u.id}>{u.question}</div>
              ))}
          </Panel>

          <Panel title="Actions" accent="var(--text)" count={state.actions.length}>
            {state.actions.map((a) => (
              <div key={a.id} className="flex items-center justify-between gap-2">
                <div>
                  <div>{a.description}</div>
                  <span className="mono text-xs" style={{ color: statusColor[a.status] }}>
                    {a.status}
                    {a.owner ? ` · ${a.owner}` : ""}
                  </span>
                </div>
                {a.requiresApproval && !a.approved && (
                  <button
                    onClick={() => approve(a.id)}
                    className="mono text-xs px-2 py-1 rounded border hover:opacity-80 shrink-0"
                    style={{ borderColor: "var(--fact)", color: "var(--fact)" }}
                  >
                    approve
                  </button>
                )}
              </div>
            ))}
          </Panel>

          <Panel title="Decisions" accent="var(--unknown)" count={state.decisions.length}>
            {state.decisions.map((d) => (
              <div key={d.id}>{d.text}</div>
            ))}
          </Panel>

          <Panel title="Participants" accent="var(--text)" count={state.participants.length}>
            <div className="flex flex-wrap gap-2">
              {state.participants.map((p) => (
                <span
                  key={p}
                  className="mono text-xs px-2 py-1 rounded-full border"
                  style={{ borderColor: "var(--panel-border)" }}
                >
                  {p}
                </span>
              ))}
            </div>
          </Panel>
        </div>
      </div>
    </main>
  );
}
