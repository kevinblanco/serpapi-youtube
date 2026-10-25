import { useEffect, useMemo, useState } from "react";
import type { Audit, RemakeCandidate } from "../../../lib/types";
import { draftBrief } from "../../../lib/brief";
import type { Opening } from "../api";
import { isSnapshot } from "../snapshot";

interface Props {
  audit: Audit;
  candidate: RemakeCandidate;
  opening: Opening | null;
  onClose: () => void;
}

export function BriefModal({ audit, candidate, opening, onClose }: Props) {
  const markdown = useMemo(() => draftBrief(audit, candidate, opening), [audit, candidate, opening]);
  const [copied, setCopied] = useState<"idle" | "copied" | "failed">("idle");
  const [raw, setRaw] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const download = () => {
    const blob = new Blob([markdown], { type: "text/markdown" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `remake-brief-${candidate.videoId}.md`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  // Some embedded views refuse the clipboard; then show the raw Markdown to select by hand.
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(markdown);
      setCopied("copied");
      setTimeout(() => setCopied("idle"), 1500);
    } catch {
      setCopied("failed");
      setRaw(true);
    }
  };

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="modal" role="dialog" aria-modal="true" aria-label="Remake brief draft">
        <div className="modal-head">
          <span className="eyebrow">Brief draft</span>
          <div className="row">
            {!opening && <span className="faint" style={{ fontSize: "0.82rem" }}>Load the transcript in the video panel to include the original opening.</span>}
            <button className="button small secondary" onClick={() => setRaw((r) => !r)} aria-pressed={raw}>
              {raw ? "Preview" : "Markdown"}
            </button>
            <button className="button small secondary" onClick={copy}>
              {copied === "copied" ? "Copied" : copied === "failed" ? "Copy blocked, select below" : "Copy Markdown"}
            </button>
            {!isSnapshot && (
              <button className="button small" onClick={download}>
                Download .md
              </button>
            )}
            <button className="close" onClick={onClose} aria-label="Close">
              ×
            </button>
          </div>
        </div>
        <div className="modal-body">
          {raw ? (
            <textarea
              id="brief-markdown"
              className="mono"
              readOnly
              value={markdown}
              onFocus={(e) => e.currentTarget.select()}
              style={{ width: "100%", minHeight: "60vh", background: "var(--ink-800)", color: "var(--text-body)", border: "1px solid var(--hairline)", borderRadius: 12, padding: "1rem" }}
            />
          ) : (
            <Markdown source={markdown} />
          )}
        </div>
      </div>
    </>
  );
}

// Just enough Markdown for the brief: headings, tables, lists, quotes, links.
// React escapes every string, so nothing here is injected as HTML.
function Markdown({ source }: { source: string }) {
  const blocks: React.ReactNode[] = [];
  const lines = source.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (!line.trim()) continue;
    const heading = line.match(/^(#{1,3})\s+(.*)$/);
    if (heading) {
      const Tag = `h${heading[1]!.length}` as "h1" | "h2" | "h3";
      blocks.push(<Tag key={i}>{inline(heading[2]!)}</Tag>);
    } else if (line.startsWith("|")) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i]!.startsWith("|")) {
        if (!/^\|(\s*:?-+:?\s*\|)+$/.test(lines[i]!)) rows.push(splitRow(lines[i]!));
        i++;
      }
      i--;
      const [head, ...body] = rows;
      blocks.push(
        <div className="table-wrap" key={i}>
          <table>
            {head && head.some((c) => c.trim()) && (
              <thead>
                <tr>
                  {head.map((c, j) => (
                    <th key={j}>{inline(c)}</th>
                  ))}
                </tr>
              </thead>
            )}
            <tbody>
              {body.map((r, j) => (
                <tr key={j}>
                  {r.map((c, k) => (
                    <td key={k}>{inline(c)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
    } else if (line.startsWith("- ")) {
      const items: string[] = [];
      while (i < lines.length && lines[i]!.startsWith("- ")) items.push(lines[i++]!.slice(2));
      i--;
      blocks.push(
        <ul key={i}>
          {items.map((t, j) => (
            <li key={j}>{inline(t)}</li>
          ))}
        </ul>,
      );
    } else if (line.startsWith("> ")) {
      blocks.push(<blockquote key={i}>{inline(line.slice(2))}</blockquote>);
    } else {
      blocks.push(<p key={i}>{inline(line)}</p>);
    }
  }
  return <div className="markdown">{blocks}</div>;
}

function splitRow(row: string): string[] {
  return row
    .replace(/^\||\|$/g, "")
    .split(/(?<!\\)\|/)
    .map((c) => c.trim().replace(/\\\|/g, "|"));
}

function inline(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const pattern = /\[(TO WRITE[^\]]*|N)\]|\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g;
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    if (match[1]) {
      parts.push(
        <span className="placeholder" key={match.index}>
          {match[0]}
        </span>,
      );
    } else {
      parts.push(
        <a key={match.index} href={match[3]} target="_blank" rel="noreferrer">
          {match[2]}
        </a>,
      );
    }
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}
