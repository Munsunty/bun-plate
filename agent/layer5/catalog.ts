import type { ToolRegistry } from "../layer2/tool";

/**
 * Layer 5 — registry of spawnable child agents. `list()` feeds the `task` tool's
 * `agent` enum at build time; `resolve()` returns the def to run.
 */

export interface SubagentDef {
  name: string;
  description: string;
  systemPrompt: string;
  registry: ToolRegistry;
  maxSteps: number;
}

export interface SubagentCatalog {
  list(): Promise<Array<{ name: string; description: string }>>;
  resolve(name: string): Promise<SubagentDef | undefined>;
}

export class StaticCatalog implements SubagentCatalog {
  private readonly byName: Map<string, SubagentDef>;

  constructor(defs: SubagentDef[]) {
    this.byName = new Map(defs.map((d) => [d.name, d]));
  }

  async list(): Promise<Array<{ name: string; description: string }>> {
    return [...this.byName.values()].map((d) => ({ name: d.name, description: d.description }));
  }

  async resolve(name: string): Promise<SubagentDef | undefined> {
    return this.byName.get(name);
  }

  /** Synchronous name list — used to build the spawn tool's enum at construction. */
  names(): string[] {
    return [...this.byName.keys()];
  }
}
