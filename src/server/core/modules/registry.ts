// Source of truth for the modules and module_dependencies tables (docs/00-master/PRODUCT-AND-MODULES.md §1).
export const MODULE_KEYS = ["core", "attendance", "routine", "exams", "fees", "website"] as const;
export type ModuleKey = (typeof MODULE_KEYS)[number];

export type ModuleTier = "CORE" | "PAID";

export interface ModuleDefinition {
  key: ModuleKey;
  name: string;
  tier: ModuleTier;
  dependsOn: readonly ModuleKey[];
  alwaysOn: boolean;
}

// Core is every institute's (D1); each paid module depends on Core only, never on another paid module (D2, D21).
export const MODULE_REGISTRY: readonly ModuleDefinition[] = [
  { key: "core", name: "Core", tier: "CORE", dependsOn: [], alwaysOn: true },
  { key: "attendance", name: "Attendance & Leave", tier: "PAID", dependsOn: ["core"], alwaysOn: false },
  { key: "routine", name: "Routine & Lesson Plans", tier: "PAID", dependsOn: ["core"], alwaysOn: false },
  { key: "exams", name: "Exams & Results", tier: "PAID", dependsOn: ["core"], alwaysOn: false },
  { key: "fees", name: "Fees & Payments", tier: "PAID", dependsOn: ["core"], alwaysOn: false },
  { key: "website", name: "Website", tier: "PAID", dependsOn: ["core"], alwaysOn: false },
];

/** Dependency-first order. Throws on an unknown dependency or a cycle. */
export function moduleActivationOrder(registry: readonly ModuleDefinition[] = MODULE_REGISTRY): ModuleKey[] {
  const byKey = new Map(registry.map((m) => [m.key, m]));
  const order: ModuleKey[] = [];
  const state = new Map<ModuleKey, "visiting" | "done">();

  const visit = (key: ModuleKey, path: ModuleKey[]) => {
    const current = state.get(key);
    if (current === "done") return;
    if (current === "visiting") throw new Error(`Module dependency cycle: ${[...path, key].join(" -> ")}`);
    const mod = byKey.get(key);
    if (!mod) throw new Error(`Unknown module "${key}" referenced by ${path.at(-1) ?? "registry"}`);
    state.set(key, "visiting");
    for (const dep of mod.dependsOn) visit(dep, [...path, key]);
    state.set(key, "done");
    order.push(key);
  };

  for (const m of registry) visit(m.key, []);
  return order;
}

/** The requested modules plus all transitive dependencies, dependency-first. */
export function closeModuleDependencies(
  keys: readonly ModuleKey[],
  registry: readonly ModuleDefinition[] = MODULE_REGISTRY,
): ModuleKey[] {
  const byKey = new Map(registry.map((m) => [m.key, m]));
  const closed = new Set<ModuleKey>();

  const visit = (key: ModuleKey) => {
    if (closed.has(key)) return;
    const def = byKey.get(key);
    if (!def) throw new Error(`Unknown module "${key}"`);
    closed.add(key);
    for (const dep of def.dependsOn) visit(dep);
  };
  for (const key of keys) visit(key);

  return moduleActivationOrder(registry).filter((key) => closed.has(key));
}

export function moduleDefinition(key: ModuleKey): ModuleDefinition {
  const def = MODULE_REGISTRY.find((m) => m.key === key);
  if (!def) throw new Error(`Unknown module "${key}"`);
  return def;
}
