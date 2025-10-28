
// file: src/types/plan.ts
export type PlanNode = {
    id: string;            // np. "k1"
    title: string;         // 4–7 słów; kąt interpretacyjny
    skills?: string[];     // 2–4 umiejętności
    kind?: 'core' | 'bridge' | 'application';
    depth: number;         // 0..N
  };
  
  export type PlanEdge = {
    from: string;          // id węzła
    to: string;            // id węzła
    type: 'prereq' | 'extends' | 'example' | 'contrast';
  };
  
  export type Plan = { nodes: PlanNode[]; edges: PlanEdge[] };
  