import type { ReactNode } from 'react';

export type MdBlock =
  | { t: 'h3'; text: string }
  | { t: 'p'; text: string }
  | { t: 'ul'; items: { b?: string; text: string }[] };
export type MdSection = { title: string; blocks: MdBlock[] };

export function markdownToSections(md: string): MdSection[] {
  const lines = String(md || '').replace(/<[^>]*>/g, '').replace(/\r\n/g, '\n').split('\n');
  const sections: MdSection[] = [];
  let current: MdSection | null = null;
  let para: string[] = [];
  let list: { b?: string; text: string }[] = [];

  const flushPara = () => {
    if (!current) return;
    const text = para.join(' ').trim();
    para = [];
    if (text) current.blocks.push({ t: 'p', text });
  };
  const flushList = () => {
    if (!current || !list.length) return;
    current.blocks.push({ t: 'ul', items: list });
    list = [];
  };
  const ensure = () => {
    if (current) return;
    current = { title: 'Overview', blocks: [] };
    sections.push(current);
  };

  for (const raw of lines) {
    const trimmed = raw.trimEnd().trim();
    if (/^##\s+/.test(trimmed) && !trimmed.startsWith('###')) {
      flushList(); flushPara();
      current = { title: trimmed.replace(/^##\s+/, ''), blocks: [] };
      sections.push(current);
      continue;
    }
    if (/^###\s+/.test(trimmed)) {
      flushList(); flushPara(); ensure();
      current!.blocks.push({ t: 'h3', text: trimmed.replace(/^###\s+/, '') });
      continue;
    }
    if (/^[-*]\s+/.test(trimmed)) {
      flushPara(); ensure();
      const item = trimmed.replace(/^[-*]\s+/, '');
      const m = item.match(/^\*\*(.+?)\*\*:?\s*(.*)$/);
      if (m) list.push({ b: m[1], text: m[2] });
      else list.push({ text: item });
      continue;
    }
    if (!trimmed) { flushList(); flushPara(); continue; }
    if (/^#\s+/.test(trimmed)) continue;
    flushList(); ensure();
    para.push(trimmed);
  }
  flushList(); flushPara();
  return sections.filter((s) => s.title || s.blocks.length);
}

function Rich({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((part, i) => {
        const m = part.match(/^\*\*([^*]+)\*\*$/);
        return m ? <strong key={i}>{m[1]}</strong> : <span key={i}>{part}</span>;
      })}
    </>
  );
}

function Blocks({ blocks }: { blocks: MdBlock[] }) {
  return (
    <>
      {blocks.map((block, i) => {
        if (block.t === 'h3') return <h3 key={i}>{block.text}</h3>;
        if (block.t === 'p') return <p key={i}><Rich text={block.text} /></p>;
        return (
          <ul key={i}>
            {block.items.map((item, j) => (
              <li key={j}>{item.b ? <><strong>{item.b}</strong>{item.text ? ` ${item.text}` : ''}</> : <Rich text={item.text} />}</li>
            ))}
          </ul>
        );
      })}
    </>
  );
}

export function MarkdownDoc({ markdown }: { markdown: string }): ReactNode {
  return markdownToSections(markdown).map((section) => (
    <section key={section.title}>
      <h2>{section.title}</h2>
      <Blocks blocks={section.blocks} />
    </section>
  ));
}

export function MarkdownFaq({ markdown }: { markdown: string }): ReactNode {
  return (
    <div className="faq-list">
      {markdownToSections(markdown).map((section) => (
        <details key={section.title}>
          <summary>{section.title}</summary>
          <Blocks blocks={section.blocks} />
        </details>
      ))}
    </div>
  );
}
