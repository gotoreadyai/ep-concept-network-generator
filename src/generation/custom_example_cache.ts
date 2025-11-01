// file: src/generation/custom_example_cache.ts
import fs from 'node:fs';
import path from 'node:path';
import { generateCustomExample, CustomExampleInput } from './custom_example_generator';

type CachedExample = {
  workTitle: string;
  author: string;
  genre: string;
  styleInspiration: string;
  example: string;
  generatedAt: string;
};

function getCachePath(mdPath: string): string {
  return mdPath.replace(/\.md$/, '.custom-example.json');
}

export async function loadOrGenerateCustomExample(
  input: CustomExampleInput & { mdPath: string }
): Promise<string> {
  const cachePath = getCachePath(input.mdPath);

  // Sprawdź czy jest w cache
  if (fs.existsSync(cachePath)) {
    console.log(`📦 Ładuję custom przykład z cache: ${path.basename(cachePath)}`);
    const cached: CachedExample = JSON.parse(fs.readFileSync(cachePath, 'utf8'));

    // Waliduj że to ten sam work/genre/style
    if (
      cached.workTitle === input.workTitle &&
      cached.author === input.author &&
      cached.genre === input.genre &&
      cached.styleInspiration === input.styleInspiration
    ) {
      return cached.example;
    } else {
      console.log(`⚠️  Cache nieaktualny, regeneruję...`);
    }
  }

  // Generuj nowy
  const example = await generateCustomExample(input);

  // Zapisz do cache
  const cached: CachedExample = {
    workTitle: input.workTitle,
    author: input.author,
    genre: input.genre,
    styleInspiration: input.styleInspiration,
    example,
    generatedAt: new Date().toISOString(),
  };

  fs.writeFileSync(cachePath, JSON.stringify(cached, null, 2), 'utf8');
  console.log(`💾 Zapisano custom przykład do cache: ${path.basename(cachePath)}`);

  return example;
}