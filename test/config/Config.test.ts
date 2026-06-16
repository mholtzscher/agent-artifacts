import * as Redacted from "effect/Redacted";
import { describe, expect, it } from "vitest";

import { makeAppConfig } from "../../src/config/Config.js";

describe("configuration", () => {
  it("normalizes Cloudflare app config from Worker bindings", () => {
    const config = makeAppConfig({
      publicBaseUrl: "https://agent-artifacts.example.com/",
      writeKey: "ap_test",
    });

    expect(config.publicBaseUrl).toBe("https://agent-artifacts.example.com");
    expect(Redacted.value(config.writeKey)).toBe("ap_test");
  });

  it("allows an empty public base URL for relative local Cloudflare responses", () => {
    const config = makeAppConfig({ writeKey: "ap_test" });

    expect(config.publicBaseUrl).toBe("");
  });
});
