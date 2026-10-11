import { describe, expect, it } from "vitest";
import { MODULE_REGISTRY, closeModuleDependencies, moduleActivationOrder, type ModuleDefinition } from "./registry";

describe("module registry", () => {
  it("makes every paid module depend on Core only (D2, D21)", () => {
    const deps = Object.fromEntries(MODULE_REGISTRY.map((m) => [m.key, [...m.dependsOn]]));
    expect(deps).toEqual({
      core: [],
      attendance: ["core"],
      routine: ["core"],
      exams: ["core"],
      fees: ["core"],
      website: ["core"],
    });
  });

  it("has exactly one always-on module, Core (D1)", () => {
    expect(MODULE_REGISTRY.filter((m) => m.alwaysOn).map((m) => m.key)).toEqual(["core"]);
  });

  it("has five paid modules", () => {
    expect(MODULE_REGISTRY.filter((m) => m.tier === "PAID")).toHaveLength(5);
  });

  it("has unique keys", () => {
    const keys = MODULE_REGISTRY.map((m) => m.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("orders every module after all of its dependencies", () => {
    const order = moduleActivationOrder();
    expect(order).toHaveLength(MODULE_REGISTRY.length);
    for (const mod of MODULE_REGISTRY) {
      for (const dep of mod.dependsOn) expect(order.indexOf(dep)).toBeLessThan(order.indexOf(mod.key));
    }
  });

  it("throws on a dependency cycle", () => {
    const cyclic = [
      { key: "fees", name: "Fees", tier: "PAID", dependsOn: ["exams"], alwaysOn: false },
      { key: "exams", name: "Exams", tier: "PAID", dependsOn: ["fees"], alwaysOn: false },
    ] as const satisfies readonly ModuleDefinition[];
    expect(() => moduleActivationOrder(cyclic)).toThrow(/cycle/);
  });

  it("throws on a dependency that isn't registered", () => {
    const missing = [
      { key: "fees", name: "Fees", tier: "PAID", dependsOn: ["core"], alwaysOn: false },
    ] as const satisfies readonly ModuleDefinition[];
    expect(() => moduleActivationOrder(missing)).toThrow(/Unknown module "core"/);
  });
});

describe("closeModuleDependencies", () => {
  it("adds Core to any requested paid module, dependency-first", () => {
    expect(closeModuleDependencies(["fees"])).toEqual(["core", "fees"]);
  });

  it("de-duplicates overlapping requests", () => {
    expect(closeModuleDependencies(["fees", "exams", "core"])).toEqual(["core", "exams", "fees"]);
  });

  it("throws on an unknown module key", () => {
    expect(() => closeModuleDependencies(["not-a-module" as never])).toThrow(/Unknown module/);
  });
});
