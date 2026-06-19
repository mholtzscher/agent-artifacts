import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as Redacted from "effect/Redacted";
import { describe, expect, it } from "vitest";

import { AppConfig } from "../../src/runtime/Config.js";

const parseAppConfig = (env: Record<string, string>) => AppConfig.parse(ConfigProvider.fromEnv({ env }));

describe("configuration", () => {
  it("parses Cloudflare app config from Worker bindings", () => {
    const config = Effect.runSync(
      parseAppConfig({
        PUBLIC_BASE_URL: "https://agent-artifacts.example.com/",
        AGENT_ARTIFACTS_WRITE_KEY: "ap_test",
      }),
    );

    expect(config.publicBaseUrl).toEqual(new URL("https://agent-artifacts.example.com/"));
    expect(Redacted.value(config.writeKey)).toBe("ap_test");
  });

  it("allows an omitted public base URL for relative local Cloudflare responses", () => {
    const config = Effect.runSync(parseAppConfig({ AGENT_ARTIFACTS_WRITE_KEY: "ap_test" }));

    expect(config.publicBaseUrl).toBeUndefined();
  });

  it("rejects an empty write key", () => {
    expect(() => Effect.runSync(parseAppConfig({ AGENT_ARTIFACTS_WRITE_KEY: "" }))).toThrow(/Invalid data <redacted>/);
  });

  it("rejects an invalid public base URL", () => {
    expect(() =>
      Effect.runSync(parseAppConfig({ PUBLIC_BASE_URL: "not a url", AGENT_ARTIFACTS_WRITE_KEY: "ap_test" })),
    ).toThrow(/Invalid URL string/);
  });

  it("allows URL public base URLs", () => {
    const config = Effect.runSync(
      parseAppConfig({ PUBLIC_BASE_URL: "http://localhost:1339/", AGENT_ARTIFACTS_WRITE_KEY: "ap_test" }),
    );

    expect(config.publicBaseUrl).toEqual(new URL("http://localhost:1339/"));
  });
});
