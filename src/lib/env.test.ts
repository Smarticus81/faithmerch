import { describe, expect, it } from "vitest";
import { REQUIRED_ENV_VARS, assertEnv, findMissingEnvVars } from "./env";

const fullEnv = Object.fromEntries(
  REQUIRED_ENV_VARS.map((name) => [name, "value"])
);

describe("findMissingEnvVars", () => {
  it("returns nothing when every var is set", () => {
    expect(findMissingEnvVars(fullEnv)).toEqual([]);
  });

  it("names each missing var", () => {
    const env = { ...fullEnv };
    delete env.RECRAFT_API_KEY;
    delete env.IG_USER_ID;
    expect(findMissingEnvVars(env)).toEqual(["RECRAFT_API_KEY", "IG_USER_ID"]);
  });

  it("treats blank and whitespace-only values as missing", () => {
    expect(findMissingEnvVars({ ...fullEnv, ADMIN_SECRET: "  " })).toEqual([
      "ADMIN_SECRET",
    ]);
    expect(findMissingEnvVars({ ...fullEnv, DATABASE_URL: "" })).toEqual([
      "DATABASE_URL",
    ]);
  });
});

describe("assertEnv", () => {
  it("passes on a complete env", () => {
    expect(() => assertEnv(fullEnv)).not.toThrow();
  });

  it("throws with the missing var named in the message", () => {
    const env = { ...fullEnv };
    delete env.SHOPIFY_ADMIN_TOKEN;
    expect(() => assertEnv(env)).toThrow(/SHOPIFY_ADMIN_TOKEN/);
  });
});
