import type { Audit } from "../../../lib/types";
import { formatCount, formatFull } from "../../../lib/format";
import { imageFor } from "../snapshot";

export function ChannelHeader({ audit }: { audit: Audit }) {
  const { channel } = audit;
  const snapshot = new Date(audit.createdAt);
  const avatar = imageFor("channel", channel.thumbnail);
  return (
    <div className="spread" style={{ alignItems: "end", gap: "2rem" }}>
      <div className="row" style={{ gap: "1.25rem", flexWrap: "nowrap" }}>
        {avatar && (
          <img
            src={avatar}
            alt=""
            width={72}
            height={72}
            style={{ borderRadius: "50%", background: "var(--ink-700)", flex: "none" }}
          />
        )}
        <div className="stack" style={{ gap: "0.6rem" }}>
          <span className="eyebrow">Channel audit</span>
          <h1>
            {channel.title} <span className="serif">audited</span>
          </h1>
          <span className="muted" style={{ fontSize: "0.9rem" }}>
            {channel.link ? (
              <a href={channel.link} target="_blank" rel="noreferrer">
                {channel.handle ?? channel.query}
              </a>
            ) : (
              (channel.handle ?? channel.query)
            )}
            {channel.joinedDate ? ` · ${channel.joinedDate}` : ""}
            {channel.country ? ` · ${channel.country}` : ""}
          </span>
        </div>
      </div>
      <dl className="row" style={{ gap: "2rem", margin: 0 }}>
        {[
          ["Subscribers", formatCount(channel.subscribers)],
          ["Total views", formatCount(channel.totalViews)],
          ["Videos", formatFull(channel.videoCount)],
        ].map(([label, value]) => (
          <div key={label} className="stack" style={{ gap: "0.2rem" }}>
            <dt className="faint" style={{ fontSize: "0.8rem" }}>
              {label}
            </dt>
            <dd style={{ margin: 0, color: "var(--text)", fontSize: "1.35rem", fontWeight: 500 }}>{value}</dd>
          </div>
        ))}
        <div className="stack" style={{ gap: "0.2rem" }}>
          <dt className="faint" style={{ fontSize: "0.8rem" }}>
            Snapshot
          </dt>
          <dd style={{ margin: 0, color: "var(--text-secondary)", fontSize: "0.95rem", paddingTop: "0.35rem" }}>
            {snapshot.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
          </dd>
        </div>
      </dl>
    </div>
  );
}

export function StatTiles({ audit }: { audit: Audit }) {
  const s = audit.summary;
  const tiles: { label: string; value: string; hint: string }[] = [
    {
      label: "Median views per video",
      value: formatCount(s.medianViews),
      hint: `${s.longFormCount} long-form videos`,
    },
    {
      label: "Expected views at 28 days",
      value: formatCount(s.expectedViewsAt28Days),
      hint: "From the channel's own age curve",
    },
    {
      label: "Uploads in the last 90 days",
      value: String(s.uploadsLast90Days),
      hint:
        s.medianDaysBetweenUploads !== null
          ? `Median ${Math.round(s.medianDaysBetweenUploads)} days between uploads`
          : "Long-form only",
    },
    {
      label: "Likes per 1,000 views",
      value: s.likesPer1kViews !== null ? s.likesPer1kViews.toFixed(1) : "–",
      hint:
        s.enrichedCount === 0
          ? "Needs video lookups"
          : s.commentsPer1kViews !== null
            ? `${s.commentsPer1kViews.toFixed(1)} comments per 1,000 · ${s.enrichedCount} videos looked up`
            : `Median of ${s.enrichedCount} videos looked up`,
    },
    {
      label: "Shorts",
      value: String(s.shortsCount),
      hint: s.shortsCount ? `Median ${formatCount(s.medianShortViews)} views` : "None found",
    },
  ];
  return (
    <div className="tiles">
      {tiles.map((t) => (
        <div key={t.label} className="card tile">
          <span className="label">{t.label}</span>
          <span className="value">{t.value}</span>
          <span className="hint">{t.hint}</span>
        </div>
      ))}
    </div>
  );
}
