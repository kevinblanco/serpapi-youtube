import { useEffect, useState } from "react";
import type { Audit, AuditOptions, ProgressEvent, VideoFormat } from "../../../lib/types";
import type { AccountResponse } from "../../../lib/serpapi-types";
import { DEFAULT_OPTIONS, channelInputError, estimateSearches, normalizeChannel } from "../../../lib/options";
import { api } from "../api";

interface Props {
  current: Audit | null;
  hasKey: boolean;
  onDone: (audit: Audit) => void;
}

const TABS: { key: VideoFormat; label: string }[] = [
  { key: "video", label: "Videos" },
  { key: "short", label: "Shorts" },
  { key: "stream", label: "Live" },
];

export function RunPanel({ current, hasKey, onDone }: Props) {
  // Folded away while an audit is on screen; open when there's nothing to show yet.
  const [open, setOpen] = useState(!current);
  const [options, setOptions] = useState<AuditOptions>({ ...DEFAULT_OPTIONS, ...(current ? { channel: current.options.channel } : {}) });
  const [account, setAccount] = useState<AccountResponse | null>(null);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<{ text: string; warn?: boolean }[]>([]);
  const [error, setError] = useState<string | null>(null);

  const loadAccount = () =>
    api
      .account()
      .then((a) => {
        setAccount(a);
        setAccountError(null);
      })
      .catch((e: Error) => setAccountError(e.message));

  useEffect(() => {
    loadAccount();
  }, []);

  const set = <K extends keyof AuditOptions>(key: K, value: AuditOptions[K]) => setOptions((o) => ({ ...o, [key]: value }));
  const sameChannel = current && current.options.channel.toLowerCase() === normalizeChannel(options.channel).toLowerCase();
  const estimate = estimateSearches(options, sameChannel ? current.channel.videoCount : null);
  const channelProblem = options.channel.trim() ? channelInputError(options.channel) : null;
  const left = account?.total_searches_left;
  const overBudget = left !== undefined && estimate > left;

  const run = async () => {
    setRunning(true);
    setError(null);
    setLog([]);
    try {
      await api.run(options, (event: ProgressEvent) => {
        if (event.type === "step") setLog((l) => [...l, { text: event.message }]);
        if (event.type === "warning") setLog((l) => [...l, { text: event.message, warn: true }]);
        if (event.type === "progress") {
          const text = `${event.label}: ${event.done}${event.total ? ` of ${event.total}` : ""}`;
          setLog((l) => (l.at(-1)?.text.startsWith(`${event.label}:`) ? [...l.slice(0, -1), { text }] : [...l, { text }]));
        }
        if (event.type === "error") setError(event.message);
        if (event.type === "done") onDone(event.audit);
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRunning(false);
      loadAccount();
    }
  };

  if (!open) {
    return (
      <div className="card spread" style={{ padding: "1rem 1.5rem" }}>
        <span className="muted" style={{ fontSize: "0.92rem" }}>
          Showing {current?.channel.title ?? "a saved audit"}. Audit your own channel, or any other, with your SerpApi key.
        </span>
        <button className="button small" onClick={() => setOpen(true)}>
          Audit a channel <span className="arrow">→</span>
        </button>
      </div>
    );
  }

  return (
    <div className="card card-hero stack" style={{ gap: "1.25rem" }}>
      <div className="spread">
        <div className="stack" style={{ gap: "0.5rem" }}>
          <span className="eyebrow">Run an audit</span>
          <h3>Any channel, through SerpApi's YouTube engines</h3>
        </div>
        <span className="pill">
          {accountError ? (
            <span title={accountError}>Account unavailable</span>
          ) : account ? (
            <>
              <span className="num">{account.total_searches_left?.toLocaleString("en-US") ?? "?"}</span> searches left
              {account.plan_name ? ` · ${account.plan_name}` : ""}
            </>
          ) : (
            "Checking account…"
          )}
        </span>
      </div>

      <div className="row">
        <label className="sr-only" htmlFor="channel">
          Channel handle, id or URL
        </label>
        <input
          id="channel"
          className="input"
          style={{ flex: "1 1 260px" }}
          value={options.channel}
          onChange={(e) => set("channel", e.target.value)}
          placeholder="@yourchannel, a UC… channel id, or the channel's URL"
          aria-invalid={channelProblem !== null}
          aria-describedby={channelProblem ? "channel-problem" : undefined}
          disabled={running}
        />
        <button className="button" onClick={run} disabled={running || !hasKey || !options.channel.trim() || channelProblem !== null}>
          {running ? "Running…" : "Run audit"} <span className="arrow">→</span>
        </button>
        {current && !running && (
          <button className="button secondary" onClick={() => setOpen(false)}>
            Close
          </button>
        )}
      </div>
      {channelProblem && (
        <p id="channel-problem" style={{ color: "var(--perf-under)", fontSize: "0.85rem", marginTop: "-0.5rem" }}>
          {channelProblem}
        </p>
      )}

      <div className="row" style={{ gap: "1.25rem", fontSize: "0.88rem" }}>
        <label className="row" style={{ gap: "0.5rem" }}>
          Video lookups
          <input
            className="input small num"
            type="number"
            min={0}
            max={500}
            style={{ width: 84 }}
            value={options.enrich}
            onChange={(e) => set("enrich", Number(e.target.value))}
            disabled={running}
          />
        </label>
        <label className="row" style={{ gap: "0.5rem" }}>
          Topic searches
          <input
            className="input small num"
            type="number"
            min={0}
            max={20}
            style={{ width: 72 }}
            value={options.demandChecks}
            onChange={(e) => set("demandChecks", Number(e.target.value))}
            disabled={running}
          />
        </label>
        {TABS.map((tab) => (
          <label key={tab.key} className="row" style={{ gap: "0.4rem" }}>
            <input
              type="checkbox"
              checked={options.tabs.includes(tab.key)}
              onChange={(e) =>
                set("tabs", e.target.checked ? [...options.tabs, tab.key] : options.tabs.filter((t) => t !== tab.key))
              }
              disabled={running}
            />
            {tab.label}
          </label>
        ))}
        <label className="row" style={{ gap: "0.4rem" }} title="Ignore responses saved in data/cache">
          <input type="checkbox" checked={options.refresh} onChange={(e) => set("refresh", e.target.checked)} disabled={running} />
          Skip local cache
        </label>
      </div>

      <p className="faint" style={{ fontSize: "0.85rem" }}>
        About <span className="num">{estimate}</span> searches
        {options.refresh ? "" : ", fewer when responses are already in the local cache"}. Video lookups add exact dates,
        likes and chapters; topic searches check how other videos do on each weak video's subject.
      </p>
      {overBudget && (
        <p style={{ color: "var(--perf-under)", fontSize: "0.85rem", marginTop: "-0.5rem" }}>
          That's more than the {left.toLocaleString("en-US")} searches you have left this month. Lower the video lookups or
          topic searches, or untick Shorts and Live, unless most of this channel is already in the local cache.
        </p>
      )}
      {!hasKey && (
        <p className="faint" style={{ fontSize: "0.85rem", marginTop: "-0.5rem" }}>
          Add SERPAPI_API_KEY to .env and restart the server to run audits.
        </p>
      )}

      {(log.length > 0 || error) && (
        <div className="log" aria-live="polite">
          {log.map((l, i) => (
            <div key={i} className={l.warn ? "warn" : undefined}>
              {l.warn ? "! " : "→ "}
              {l.text}
            </div>
          ))}
          {error && <div className="warn">✕ {error}</div>}
        </div>
      )}
    </div>
  );
}
