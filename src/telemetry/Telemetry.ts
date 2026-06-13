import * as NodeSdk from "@effect/opentelemetry/NodeSdk"
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http"
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http"
import { BatchLogRecordProcessor } from "@opentelemetry/sdk-logs"
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-base"
import * as Config from "effect/Config"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"

export const TelemetryLive = Layer.unwrap(
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
      spanProcessor: new BatchSpanProcessor(new OTLPTraceExporter()),
      logRecordProcessor: new BatchLogRecordProcessor(new OTLPLogExporter())
    }))
  })
)
