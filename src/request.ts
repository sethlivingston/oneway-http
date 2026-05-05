import type {
  QueryValue,
  RequestSpec,
  ResponseMap,
  InferResponseUnion,
} from "./types.js";

export function buildPath(segments: readonly (string | number)[]): string {
  return segments.map((s) => encodeURIComponent(String(s))).join("/");
}

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

export class Request<R> {
  #consumed = false;
  readonly #spec: RequestSpec;

  private constructor(spec: RequestSpec) {
    this.#spec = spec;
  }

  static create<M extends ResponseMap>(
    input: RequestSpec<M>,
  ): Request<InferResponseUnion<M>> {
    return new Request(input as unknown as RequestSpec);
  }

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
