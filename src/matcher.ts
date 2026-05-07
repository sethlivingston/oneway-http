// src/matcher.ts — exhaustive runtime dispatcher over SendResult<R>
import type {
  BodyPreview,
  DecodeError,
  RequestError,
  SendResult,
  TransportError,
} from "./types.js";

// TagsOf<R> — internal, not exported (D-03).
// Intentionally distributive — do NOT wrap in [T]; distribution over union members is the point.
type TagsOf<R> = R extends { tag: infer T extends string } ? T : never;

// Matcher<R,T> — exported flat type (D-01, D-02).
// All properties are required — missing any handler is a compile-time error at the call site.
export type Matcher<R extends { tag: string; body: unknown }, T> =
  { [Tag in TagsOf<R>]: (response: Extract<R, { tag: Tag }>) => T } &
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

// match<R,T>() — exported function (D-04, D-05).
// Never throws. All SendResult<R> variants are handled exhaustively.
export function match<R extends { tag: string; body: unknown }, T>(
  result: SendResult<R>,
  handlers: Matcher<R, T>,
): T {
  switch (result.kind) {
    case "response": {
      // Cast required by noUncheckedIndexedAccess — result is ((r: unknown) => T) | undefined.
      // Undefined branch is unreachable at runtime: Matcher<R,T> guarantees a handler for every
      // tag in TagsOf<R>. Cannot use ! operator (banned); use conditional guard instead. (D-05)
      const handler = (handlers as Record<string, (r: unknown) => T>)[
        result.response.tag
      ];
      if (handler === undefined) {
        return handler as T; // unreachable
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
      // Compile-time exhaustiveness guard — never executes at runtime.
      // TypeScript narrows result to never here after all 5 cases are covered.
      const _exhaustive: never = result;
      return _exhaustive;
    }
  }
}

// Send — exported const object (D-02). Consumers call Send.match(result, handlers).
// NOT a namespace — TypeScript namespaces are banned. This achieves the same call shape.
export const Send = { match } as const;
