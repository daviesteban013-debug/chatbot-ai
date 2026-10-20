"use client";
import { useMemo, type ReactNode } from "react";
import { parseRichText, type Block, type Inline } from "@/lib/rich-text";
import styles from "./rich-text.module.css";

function renderInline(nodes: Inline[], onOpen?: (href: string) => void): ReactNode[] {
  return nodes.map((node, index) => {
    switch (node.t) {
      case "text": return node.v;
      case "br": return <br key={index} />;
      case "strong": return <strong key={index}>{renderInline(node.c, onOpen)}</strong>;
      case "em": return <em key={index}>{renderInline(node.c, onOpen)}</em>;
      case "code": return <code key={index}>{node.v}</code>;
      case "link": return node.href.startsWith("/")
        ? <a key={index} href={node.href} onClick={event => { if (onOpen) { event.preventDefault(); onOpen(node.href); } }}>{renderInline(node.c, onOpen)}</a>
        : <a key={index} href={node.href} target="_blank" rel="noopener noreferrer">{renderInline(node.c, onOpen)}</a>;
    }
  });
}

function renderBlock(block: Block, index: number, onOpen?: (href: string) => void): ReactNode {
  switch (block.t) {
    case "p": return <p key={index}>{renderInline(block.c, onOpen)}</p>;
    case "h": { const Tag = (`h${block.level + 2}`) as "h3" | "h4" | "h5"; return <Tag key={index} data-level={block.level}>{renderInline(block.c, onOpen)}</Tag>; }
    case "ul": return <ul key={index}>{block.items.map((item, i) => <li key={i}>{renderInline(item, onOpen)}</li>)}</ul>;
    case "ol": return <ol key={index} start={block.start}>{block.items.map((item, i) => <li key={i}>{renderInline(item, onOpen)}</li>)}</ol>;
    case "quote": return <blockquote key={index}>{renderInline(block.c, onOpen)}</blockquote>;
    case "code": return <pre key={index}><code>{block.v}</code></pre>;
    case "hr": return <hr key={index} />;
    case "table": return <div key={index} className={styles.tableWrap}><table>
      <thead><tr>{block.head.map((cell, i) => <th key={i}>{renderInline(cell, onOpen)}</th>)}</tr></thead>
      <tbody>{block.rows.map((row, r) => <tr key={r}>{row.map((cell, c) => <td key={c}>{renderInline(cell, onOpen)}</td>)}</tr>)}</tbody>
    </table></div>;
  }
}

/** Zorax's answers with real structure. Internal links open through onOpen (the CRM), never by navigation. */
export function RichText({ source, className, onOpen }: { source: string; className?: string; onOpen?(href: string): void }) {
  const blocks = useMemo(() => parseRichText(source), [source]);
  return <div className={`${styles.rich} ${className ?? ""}`}>{blocks.map((block, index) => renderBlock(block, index, onOpen))}</div>;
}
