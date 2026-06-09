import * as NodeSdk from "@effect/opentelemetry/NodeSdk"
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http"
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-base"
import * as Config from "effect/Config"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"

export const TelemetryLive = Layer.unwrapEffect(
  Effect.gen(function*() {
    const deploymentEnvironment = yield* Config.string("NODE_ENV").pipe(
      Config.withDefault("development"),
      Effect.map((value) => value.trim() || "development")
    )

    return NodeSdk.layer(() => ({
      resource: {
        serviceName: "agent-artifacts",
        attributes: {
          "deployment.environment.name": deploymentEnvironment
        }
      },
      spanProcessor: new BatchSpanProcessor(new OTLPTraceExporter())
    }))
  })
)
