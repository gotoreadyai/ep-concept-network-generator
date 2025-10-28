// file: src/util/markdown.ts
export function extractH1Title(md: string): string {
    const m = (md || '').match(/^#\s+(.+?)\s*$/m);
    const title = m?.[1]?.trim() || '';
    if (!title) throw new Error('Brak H1 w wygenerowanym Markdownie');
    return title;
  }
  