import type {
  QueryValue,
  RequestSpec,
  ResponseMap,
  InferResponseUnion,
} from "./types.js";

/**
 * @internal
 * Encodes each path segment with `encodeURIComponent` and joins with `/`.
 * @param segments - Ordered path segments (strings or numbers).
 * @returns A URL path string (no leading slash).
 */
export function buildPath(segments: readonly (string | number)[]): string {
  return segments.map((s) => encodeURIComponent(String(s))).join("/");
}

/**
 * @internal
 * Converts a query record to `URLSearchParams`. `undefined` values are omitted; arrays repeat the key.
 * @param query - Query parameters record.
 * @returns A populated `URLSearchParams` instance.
 */
export function buildQuery(
  query: Record<string, QueryValue | readonly QueryValue[] | undefined>,
): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const v of value) params.append(key, String(v));
    } else {
      params.append(key, String(value));
    }
  }
  return params;
}

/** Affine HTTP request wrapper. Create with `Request.create()`; each instance may only be sent once. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- R is a phantom type parameter; consumers use Request<T> to carry response type
export class Request<R> {
  #consumed = false;
  readonly #spec: RequestSpec;

  private constructor(spec: RequestSpec) {
    this.#spec = spec;
  }

  /**
   * Creates a new `Request` from a typed `RequestSpec`. Infers the response union from the `responses` map.
   * @param input - The request specification.
   * @returns A new unconsumed `Request<InferResponseUnion<M>>` instance.
   */
  static create<M extends ResponseMap>(
    input: RequestSpec<M>,
  ): Request<InferResponseUnion<M>> {
    return new Request(input);
  }

  /**
   * @internal
   * Extracts the `RequestSpec` and marks the request as consumed. Throws `TypeError` if already consumed.
   * @returns The inner `RequestSpec`.
   */
  consume(): RequestSpec {
    if (this.#consumed) {
      throw new TypeError(
        "Request has already been consumed and cannot be sent again",
      );
    }
    this.#consumed = true;
    return this.#spec;
  }
}
