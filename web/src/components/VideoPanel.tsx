import { useEffect, useState } from "react";
import type { Audit } from "../../../lib/types";
import { formatAge, formatDuration, formatFull, formatMultiple } from "../../../lib/format";
import { api, type Opening } from "../api";
import { BLANK_IMAGE, PerfChip } from "./Tables";
import { imageFor, isSnapshot } from "../snapshot";

interface Props {
  audit: Audit;
  videoId: string;
  opening: Opening | null;
  onOpening: (opening: Opening) => void;
  onClose: () => void;
}

export function VideoPanel({ audit, videoId, opening, onOpening, onClose }: Props) {
  const video = audit.videos.find((v) => v.id === videoId);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => setError(null), [videoId]);

  if (!video) return null;
  const per1k = (n: number | null) => (n !== null && video.views ? ((n / video.views) * 1000).toFixed(1) : "–");

  const loadOpening = async () => {
    setLoading(true);
    setError(null);
    try {
      onOpening(await api.opening(video.id));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <aside className="drawer stack" style={{ gap: "1.4rem" }} role="dialog" aria-modal="true" aria-label={video.title}>
        <div className="spread">
          <span className="eyebrow">{video.format === "video" ? "Video" : video.format === "short" ? "Short" : "Live stream"}</span>
          <button className="close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <img
          src={imageFor(video.id, `https://i.ytimg.com/vi/${video.id}/hqdefault.jpg`) ?? BLANK_IMAGE}
          onError={(e) => {
            if (e.currentTarget.src !== BLANK_IMAGE) e.currentTarget.src = BLANK_IMAGE;
          }}
          alt=""
          style={{ width: "100%", aspectRatio: "16 / 9", objectFit: "cover", borderRadius: 12, background: "var(--ink-700)" }}
        />
        <h2 style={{ fontSize: "1.35rem", lineHeight: 1.25 }}>{video.title}</h2>
        <div className="row">
          <PerfChip value={video.performance} />
          <span className="muted">of what this channel usually gets at {formatAge(video.ageDays)}</span>
        </div>
        <dl className="kv num">
          <dt>Views</dt>
          <dd>{formatFull(video.views)}</dd>
          <dt>Expected</dt>
          <dd>{formatFull(video.expectedViews)}</dd>
          <dt>Published</dt>
          <dd>
            {video.publishedAt ?? "–"}
            {video.datePrecision === "relative" ? ` (estimated from "${video.publishedLabel}")` : ""}
          </dd>
          <dt>Length</dt>
          <dd>{formatDuration(video.durationSec)}</dd>
          <dt>Likes</dt>
          <dd>{video.enriched ? `${formatFull(video.likes)} (${per1k(video.likes)} per 1,000 views)` : "Not looked up"}</dd>
          {video.comments !== null && (
            <>
              <dt>Comments</dt>
              <dd>{`${formatFull(video.comments)} (${per1k(video.comments)} per 1,000 views)`}</dd>
            </>
          )}
          <dt>Description</dt>
          <dd>
            {video.enriched
              ? `${formatFull(video.descriptionLength)} characters, ${video.descriptionLinks ?? 0} ${video.descriptionLinks === 1 ? "link" : "links"}`
              : "Not looked up"}
          </dd>
        </dl>

        {video.enriched && (
          <div className="stack" style={{ gap: "0.5rem" }}>
            <h3>Chapters</h3>
            {video.chapters.length ? (
              <div className="transcript">
                {video.chapters.map((c) => (
                  <p key={c.startSec}>
                    <span className="t">{formatDuration(c.startSec)}</span>
                    <span>{c.title}</span>
                  </p>
                ))}
              </div>
            ) : (
              <p className="muted">None.</p>
            )}
          </div>
        )}

        <div className="stack" style={{ gap: "0.75rem" }}>
          <div className="spread">
            <h3>The first minute</h3>
            {!opening && !isSnapshot && (
              <button className="button small secondary" onClick={loadOpening} disabled={loading}>
                {loading ? "Loading…" : "Load transcript (1 search)"}
              </button>
            )}
          </div>
          {error && <p className="notice">{error}</p>}
          {opening && (
            <>
              <p className="muted num">
                {opening.wordsInFirst30s} words in the first 30 seconds
                {opening.wordsInFirst30s ? ` (about ${Math.round(opening.wordsInFirst30s * 2)} per minute)` : ""}
                {opening.language ? ` · ${opening.language}` : ""}
              </p>
              <div className="transcript">
                {opening.segments.map((s, i) => (
                  <p key={i}>
                    <span className="t">{formatDuration(s.startSec)}</span>
                    <span>{s.text}</span>
                  </p>
                ))}
              </div>
            </>
          )}
          {!opening && isSnapshot && (
            <p className="faint" style={{ fontSize: "0.85rem" }}>
              This video's transcript wasn't loaded when the snapshot was taken.
            </p>
          )}
          {!opening && !error && !isSnapshot && (
            <p className="faint" style={{ fontSize: "0.85rem" }}>
              Compare the opening of a strong video with a weak one: it shows quickly how each sets up its promise.
            </p>
          )}
        </div>

        <a className="button secondary" href={video.link} target="_blank" rel="noreferrer" style={{ justifySelf: "start" }}>
          Open on YouTube <span className="arrow">→</span>
        </a>
        <p className="faint" style={{ fontSize: "0.8rem" }}>
          Performance {formatMultiple(video.performance)} = views ÷ expected views for a video this age on this channel.
        </p>
      </aside>
    </>
  );
}
