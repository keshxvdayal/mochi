import { Fragment } from "react";

function inline(text: string, key: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const re = /\*\*([^*]+)\*\*|\*([^*\s][^*]*)\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let n = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(m[1] ? <strong key={`${key}${n++}`}>{m[1]}</strong> : <em key={`${key}${n++}`}>{m[2]}</em>);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** Tiny markdown: paragraphs, bullet/numbered lists, headings, bold/italic. No HTML. */
export function RichText({ text }: { text: string }) {
  const blocks: React.ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  let para: string[] = [];
  const flush = () => {
    if (para.length) blocks.push(<p key={`p${blocks.length}`}>{inline(para.join(" "), `p${blocks.length}`)}</p>);
    para = [];
    if (list) {
      const k = `l${blocks.length}`;
      const items = list.items.map((it, i) => <li key={i}>{inline(it, `${k}-${i}`)}</li>);
      blocks.push(list.ordered ? <ol key={k}>{items}</ol> : <ul key={k}>{items}</ul>);
      list = null;
    }
  };
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    const ul = line.match(/^[-*•]\s+(.*)$/);
    const ol = line.match(/^\d+[.)]\s+(.*)$/);
    const h = line.match(/^#{1,4}\s+(.*)$/);
    if (h) {
      flush();
      blocks.push(<h3 key={`h${blocks.length}`}>{inline(h[1], `h${blocks.length}`)}</h3>);
    } else if (ul || ol) {
      if (para.length) {
        blocks.push(<p key={`p${blocks.length}`}>{inline(para.join(" "), `p${blocks.length}`)}</p>);
        para = [];
      }
      if (list && list.ordered !== Boolean(ol)) flush();
      list ??= { ordered: Boolean(ol), items: [] };
      list.items.push((ul ?? ol)![1]);
    } else if (!line) flush();
    else {
      if (list) flush();
      para.push(line);
    }
  }
  flush();
  return <div className="prose-chat">{blocks.map((b, i) => <Fragment key={i}>{b}</Fragment>)}</div>;
}
