// file: src/pipeline/plan_scale.ts
export type ScaleSpec = {
    targetNodes: number;
    minNodes: number;
    maxNodes: number;
    maxDepth: number;
    maxPrereqsPerNode: number;
    distribution: { core: number; bridge: number; application: number }; // ułamki 0..1
  };
  
  /**
   * Heurystyka dobierająca rozmiar planu do tematu.
   * Działa offline; nie dzwoni do modelu.
   */
  export function computeScaleSpec(topicTitle: string, topicDescription: string): ScaleSpec {
    const txt = `${topicTitle} ${topicDescription}`.toLowerCase();
  
    const isHuge =
      /(ii|2)\s*wojna\s*światowa|world\s*war\s*ii|historia\s+europy|rewolucja\s+przemysłowa|zimna\s+wojna/.test(txt);
    const isLarge =
      /wojna|okres|panowanie|imperium|renesans|barok|oświecenie|średniowiecze|konflikt|kampania|gospodarka/.test(txt);
    const isTiny =
      /bitwa|potyczka|postać|wiersz|obraz|patent|pojęcie|prawo|definicja|zjawisko/.test(txt);
  
    // Podstawowe widełki:
    let targetNodes = 14, maxDepth = 5;
    if (isHuge) { targetNodes = 28; maxDepth = 7; }
    else if (isLarge) { targetNodes = 18; maxDepth = 6; }
    else if (isTiny) { targetNodes = 8; maxDepth = 4; }
  
    // Delikatna korekta po długości opisu:
    const len = topicDescription.length;
    if (len > 600) targetNodes += 4;
    else if (len < 160) targetNodes -= 2;
  
    const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
    targetNodes = clamp(targetNodes, 6, 36);
  
    const minNodes = Math.max(6, Math.floor(targetNodes * 0.8));
    const maxNodes = Math.min(36, Math.ceil(targetNodes * 1.2));
  
    const maxPrereqsPerNode = targetNodes > 20 ? 3 : 2;
  
    // Rozkład funkcji węzłów – więcej „core” na małych tematach,
    // przy dużych zwiększamy „bridge” i „application”.
    let distribution = { core: 0.6, bridge: 0.2, application: 0.2 };
    if (isHuge) distribution = { core: 0.45, bridge: 0.3, application: 0.25 };
    else if (isLarge) distribution = { core: 0.5, bridge: 0.25, application: 0.25 };
    else if (isTiny) distribution = { core: 0.7, bridge: 0.15, application: 0.15 };
  
    return { targetNodes, minNodes, maxNodes, maxDepth, maxPrereqsPerNode, distribution };
  }
  