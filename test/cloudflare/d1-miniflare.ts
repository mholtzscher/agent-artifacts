import { D1Client } from "@effect/sql-d1";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { readFile } from "node:fs/promises";
import { Miniflare } from "miniflare";

const migrationUrl = new URL("../../migrations/d1/0001_create_artifacts.sql", import.meta.url);

export const D1MiniflareSqlLive = Layer.unwrap(
  Effect.gen(function* () {
    const miniflare = yield* Effect.acquireRelease(
      Effect.sync(
        () =>
          new Miniflare({
            modules: true,
            script: "",
            d1Databases: { DB: "test-db" },
          }),
      ),
      (mf) => Effect.promise(() => mf.dispose()),
    );

    const db = yield* Effect.promise(() => miniflare.getD1Database("DB"));
    const migration = yield* Effect.promise(() => readFile(migrationUrl, "utf8"));
    const statements = migration
      .split(";")
      .map((statement) => statement.trim())
      .filter((statement) => statement.length > 0);

    yield* Effect.forEach(statements, (statement) => Effect.promise(() => db.prepare(statement).run()), {
      discard: true,
    });

    return D1Client.layer({ db });
  }),
);
