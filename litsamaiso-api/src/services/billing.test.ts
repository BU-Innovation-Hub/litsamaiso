import test from "node:test";
import assert from "node:assert/strict";

import { isPlanKey, planFromLookupKey, PLANS, PLAN_KEYS } from "../config/plans.js";
import { getStudentCap } from "./billingService.js";
import { DEFAULT_THEME, parseTheme, validateTheme } from "../utils/themePalette.js";

test("plans charge the agreed annual ZAR amounts", () => {
  assert.equal(PLANS.starter.amountZarCents, 7_500_000);
  assert.equal(PLANS.professional.amountZarCents, 12_000_000);
  assert.equal(PLANS.enterprise.amountZarCents, 15_000_000);
});

test("plan lookup keys are unique and map back to their plan", () => {
  const keys = PLAN_KEYS.map((key) => PLANS[key].lookupKey);
  assert.equal(new Set(keys).size, keys.length);
  for (const key of PLAN_KEYS) assert.equal(planFromLookupKey(PLANS[key].lookupKey), key);
  assert.equal(planFromLookupKey("something_else"), undefined);
  assert.equal(isPlanKey("professional"), true);
  assert.equal(isPlanKey("platinum"), false);
});

test("student caps follow the plan; manual institutions without a plan are uncapped", () => {
  assert.equal(getStudentCap({ billing: { status: "active", plan: "starter" } }), 2_000);
  assert.equal(getStudentCap({ billing: { status: "active", plan: "enterprise" } }), null);
  assert.equal(getStudentCap({ billing: { status: "manual" } }), null);
  assert.equal(getStudentCap(null), null);
});

test("the default theme and curated presets pass the 60-30-10 guardrails", () => {
  assert.deepEqual(validateTheme(DEFAULT_THEME), []);
  assert.deepEqual(validateTheme({ preset: "maluti-blue", primary: "#0b2545", accent: "#2563eb", surface: "soft" }), []);
});

test("themes that would be unreadable or indistinct are rejected", () => {
  const base = { preset: "custom", surface: "light" as const };
  assert.ok(validateTheme({ ...base, primary: "#f5f5f5", accent: "#2563eb" }).length, "light primary");
  assert.ok(validateTheme({ ...base, primary: "#0b2545", accent: "#0c2748" }).length, "accent too close");
  assert.ok(validateTheme({ ...base, primary: "red", accent: "#2563eb" }).length, "not hex");
  assert.ok(validateTheme({ ...base, preset: "neon", primary: "#0b2545", accent: "#2563eb" }).length, "unknown preset");
  assert.ok(
    validateTheme({ ...base, primary: "#0b2545", accent: "#2563eb", logoUrl: "javascript:alert(1)" }).length,
    "unsafe logo url",
  );
});

test("parseTheme keeps only known, well-typed fields", () => {
  assert.deepEqual(parseTheme({ preset: " slate ", primary: "#1E293B", accent: "#0F766E", surface: "soft", evil: 1 }), {
    preset: "slate",
    primary: "#1e293b",
    accent: "#0f766e",
    surface: "soft",
  });
  assert.deepEqual(parseTheme("nope"), {});
});
