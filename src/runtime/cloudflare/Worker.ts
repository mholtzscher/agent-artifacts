import * as Context from "effect/Context";
import { HttpMiddleware, HttpRouter } from "effect/unstable/http";

import type { CloudflareBindings } from "./CloudflareBindings.js";
import { CloudflareAppLive } from "./CloudflareApp.js";

export type WorkerEnv = CloudflareBindings;

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    const { handler, dispose } = HttpRouter.toWebHandler(CloudflareAppLive(env), {
      middleware: HttpMiddleware.logger,
    });

    try {
      return await handler(request, Context.empty() as never);
    } finally {
      await dispose();
    }
  },
} satisfies ExportedHandler<WorkerEnv>;
