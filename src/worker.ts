import { handlerForCloudflareEnv } from "./cloudflare/App.js";
import type { CloudflareBindings } from "./cloudflare/Bindings.js";

export default {
  fetch(request: Request, env: CloudflareBindings): Promise<Response> {
    return handlerForCloudflareEnv(env)(request);
  },
} satisfies ExportedHandler<CloudflareBindings>;
