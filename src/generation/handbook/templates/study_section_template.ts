// file: src/generation/handbook/templates/study_section_template.ts
/**
 * Minimalny, deterministyczny „silnik szablonów” dla sekcji maturalnej.
 *
 * Wejście: lista bloków { id, title, items[] }
 * Wyjście: gotowy HTML z <study-section><study-global>…</study-global></study-section>
 *
 * Brak regexów do walidacji struktury HTML – generujemy markup w 100% po naszej stronie.
 */
export type StudyBlock = {
    id: string;                    // np. "study-theses"
    title: string;                 // np. "Tezy i problemy"
    items: string[];               // czysty tekst, BEZ HTML
  };
  
  export type LinkStrategy =
    | { mode: 'none' }
    | { mode: 'hash' }                                     // "(Rozdział X)" → <a href="#ch-0X">…</a>
    | { mode: 'map'; hrefMap: Record<number, string> };    // mapowanie numer → href (np. do slugów)
  
  function escapeHtml(s: string): string {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
  
  /**
   * Linkowanie wyłącznie wzorca tekstowego "(Rozdział X)", bez użycia regexów w runtime.
   * Zachowujemy pełny escaping pozostałej treści.
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
  
      // prefix przed wzorcem
      out += escapeHtml(raw.slice(i, pos));
  
      // spróbuj sparsować numer "(Rozdział XX)"
      let j = pos + open.length;
      let numStr = '';
      while (j < raw.length && numStr.length < 2 && raw[j] >= '0' && raw[j] <= '9') {
        numStr += raw[j];
        j++;
      }
  
      // oczekujemy ')'
      if (numStr.length >= 1 && j < raw.length && raw[j] === ')') {
        const idx = Number(numStr);
        const href =
          strategy.mode === 'hash'
            ? `#ch-${String(idx).padStart(2, '0')}`
            : strategy.mode === 'map'
              ? (strategy.hrefMap[idx] || '')
              : '';
  
        const label = `Rozdział ${idx}`;
        if (href) {
          out += `<a href="${escapeHtml(href)}">${escapeHtml(label)}</a>`;
        } else {
          out += escapeHtml(`(${label})`);
        }
  
        i = j + 1; // przeskocz ')'
        continue;
      }
  
      // niepełny wzorzec → traktuj jako tekst
      out += escapeHtml(raw.slice(pos, pos + open.length));
      i = pos + open.length;
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
    strategy: LinkStrategy = { mode: 'none' }
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
  