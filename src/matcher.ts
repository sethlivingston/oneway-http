import type {
  BodyPreview,
  DecodeError,
  RequestError,
  SendResult,
  TransportError,
} from "./types.js";

type TagsOf<R> = R extends { tag: infer T extends string } ? T : never;

type ReservedTags = "transportError" | "decodeError" | "unhandledStatus" | "requestError";

/** Exhaustive handler map for every variant of `SendResult<R>`. Used with `Send.match()`. */
export type Matcher<R extends { tag: string; body: unknown }, T> =
  { [Tag in Exclude<TagsOf<R>, ReservedTags>]: (response: Extract<R, { tag: Tag }>) => T } &
  {
    transportError: (error: TransportError) => T;
    decodeError: (
      error: DecodeError,
      status: number,
      headers: Headers,
      preview: BodyPreview,
    ) => T;
    unhandledStatus: (
      status: number,
      headers: Headers,
      preview: BodyPreview,
    ) => T;
    requestError: (error: RequestError) => T;
  };

/**
 * Dispatches a `SendResult<R>` to the matching handler in `handlers`.
 * All response tag handlers and all error handlers must be provided — TypeScript enforces exhaustiveness.
 * @param result - The `SendResult<R>` returned by `client.send()`.
 * @param handlers - A `Matcher<R, T>` object with one handler per `SendResult` variant.
 * @returns The value returned by the matched handler.
 */
export function match<R extends { tag: string; body: unknown }, T>(
  result: SendResult<R>,
  handlers: Matcher<R, T>,
): T {
  switch (result.kind) {
    case "response": {
      const handler = (handlers as unknown as Record<string, (r: unknown) => T>)[
        result.response.tag
      ];
      if (handler === undefined) {
        return handler as unknown as T;
      }
      return handler(result.response);
    }
    case "transportError":
      return handlers.transportError(result.error);
    case "decodeError":
      return handlers.decodeError(
        result.error,
        result.status,
        result.headers,
        result.preview,
      );
    case "unhandledStatus":
      return handlers.unhandledStatus(
        result.status,
        result.headers,
        result.preview,
      );
    case "requestError":
      return handlers.requestError(result.error);
    default: {
      const exhaustiveGuard: never = result;
      return exhaustiveGuard;
    }
  }
}

/** Namespace containing `Send.match()` — the exhaustive `SendResult` dispatcher. */
export const Send = { match } as const;
