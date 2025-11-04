// file: src/generation/handbook/templates/study_section_template.ts
/**
 * Deterministyczny renderer sekcji maturalnej + linkowanie "(Rozdział ...)".
 * - Linkujemy liczby (1, 6, 3–5) wewnątrz nawiasów.
 * - Słowo "Rozdział" zostaje tekstem.
 * - Brak regexów do walidacji HTML; całość składamy świadomie.
 */

export type StudyBlock = {
    id: string;          // np. "study-theses"
    title: string;       // np. "Tezy i problemy"
    items: string[];     // czysty tekst, BEZ HTML
  };
  
  export type LinkStrategy =
    | { mode: 'none' } // bez linków
    | { mode: 'hash' } // #ch-XX
    | { mode: 'map'; hrefMap: Record<number, string> }; // num -> href (np. slug)
  
  function escapeHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  
  function hrefFor(n: number, strategy: LinkStrategy): string | null {
    if (strategy.mode === 'hash') return `#ch-${String(n).padStart(2, '0')}`;
    if (strategy.mode === 'map') return strategy.hrefMap[n] || null;
    return null;
  }
  
  /**
   * Renderuje zawartość nawiasu "(Rozdział ...)" z linkami:
   * - "1, 6" → Rozdział <a href="#ch-01">1</a>, <a href="#ch-06">6</a>
   * - "3–5"  → Rozdział <a href="#ch-03">3</a>–<a href="#ch-05">5</a>
   * Zachowujemy oryginalne spacje przy przecinkach oraz rodzaj łącznika (-/–/—).
   */
  function renderChapterRefsList(rawList: string, strategy: LinkStrategy): string {
    // rozdziel po przecinkach Z ZACHOWANIEM separatorów (np. ", "):
    const parts = rawList.split(/(\s*,\s*)/); // np. ["1", ", ", "6"]
    let html = 'Rozdział ';
  
    for (let i = 0; i < parts.length; i++) {
      const chunk = parts[i];
  
      // separator przecinka — wypisz jak jest (escapując)
      if (i % 2 === 1) {
        html += escapeHtml(chunk);
        continue;
      }
  
      const token = chunk.trim();
      if (!token) continue;
  
      // zakres? (różne łączniki: -, –, —)
      const mRange = token.match(/^(\d{1,2})\s*([\-–—])\s*(\d{1,2})$/);
      if (mRange) {
        const a = Number(mRange[1]);
        const dash = mRange[2];
        const b = Number(mRange[3]);
        const hrefA = hrefFor(a, strategy);
        const hrefB = hrefFor(b, strategy);
        html += hrefA ? `<a href="${escapeHtml(hrefA)}">${escapeHtml(String(a))}</a>` : escapeHtml(String(a));
        html += escapeHtml(dash);
        html += hrefB ? `<a href="${escapeHtml(hrefB)}">${escapeHtml(String(b))}</a>` : escapeHtml(String(b));
        continue;
      }
  
      // pojedynczy numer
      const mSingle = token.match(/^(\d{1,2})$/);
      if (mSingle) {
        const n = Number(mSingle[1]);
        const href = hrefFor(n, strategy);
        html += href ? `<a href="${escapeHtml(href)}">${escapeHtml(String(n))}</a>` : escapeHtml(String(n));
        continue;
      }
  
      // fallback – nieoczekiwany format, wypisz surowo (escapując)
      html += escapeHtml(token);
    }
  
    return html;
  }
  
  /**
   * Linkuje wszystkie wystąpienia "(Rozdział ...)" w tekście.
   * Reszta treści jest escapowana.
   */
  function linkifyChapterRefs(raw: string, strategy: LinkStrategy): string {
    if (strategy.mode === 'none') return escapeHtml(raw);
  
    const open = '(Rozdział ';
    let out = '';
    let i = 0;
  
    while (i < raw.length) {
      const pos = raw.indexOf(open, i);
      if (pos === -1) {
        out += escapeHtml(raw.slice(i));
        break;
      }
  
      // prefix
      out += escapeHtml(raw.slice(i, pos));
  
      // spróbuj odczytać wnętrze aż do ')'
      let j = pos + open.length;
      let inner = '';
      let closed = false;
      while (j < raw.length) {
        const ch = raw[j++];
        if (ch === ')') { closed = true; break; }
        inner += ch;
      }
  
      if (closed) {
        // wyrenderuj listę rozdziałów z linkami
        out += renderChapterRefsList(inner.trim(), strategy);
        i = j; // po ')'
      } else {
        // brak zamknięcia – potraktuj jako zwykły tekst
        out += escapeHtml(open);
        i = pos + open.length;
      }
    }
  
    return out;
  }
  
  function renderLi(text: string, strategy: LinkStrategy): string {
    return `<li>${linkifyChapterRefs(text, strategy)}</li>`;
  }
  
  function renderBlock(block: StudyBlock, strategy: LinkStrategy): string {
    const lis = block.items.map(t => renderLi(t, strategy)).join('\n');
    return [
      `<study-block id="${block.id}" data-type="${block.id.replace(/^study-/, '')}">`,
      `  <h2>${escapeHtml(block.title)}</h2>`,
      `  <ul>`,
      lis,
      `  </ul>`,
      `</study-block>`,
    ].join('\n');
  }
  
  export function renderStudySection(
    blocks: StudyBlock[],
    strategy: LinkStrategy = { mode: 'hash' } // domyślnie: #ch-XX
  ): string {
    const inner = blocks.map(b => renderBlock(b, strategy)).join('\n\n');
    return [
      '<study-section>',
      '  <study-global>',
      inner,
      '  </study-global>',
      '</study-section>',
      '',
    ].join('\n');
  }