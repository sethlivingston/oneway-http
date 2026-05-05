// src/preview.ts — body preview streaming; extracted from send.ts (D-11)
// Dependency direction: send.ts → preview.ts → types.ts

import type { BodyPreview } from "./types.js";

// D-15, D-16, D-17: Body preview streaming with correct truncation detection
// Extracted from send.ts — no behaviour changes (D-11)
// Signal-aware: when the caller's AbortSignal fires, reader.read() rejects and re-throws.
export async function readBodyPreview(
  response: globalThis.Response,
  maxBytes: number,
): Promise<BodyPreview> {
  if (response.body === null) {
    // Handles 204 No Content, 304 Not Modified, 205 Reset Content, HEAD responses
    return { text: "", bytesRead: 0, truncated: false };
  }

  // maxBytes <= 0: no preview requested — cancel the stream immediately to release the TCP
  // connection. The body is non-empty (response.body !== null) so truncated must be true.
  if (maxBytes <= 0) {
    const reader = response.body.getReader();
    await reader.cancel().catch(() => {
      // Swallow cancel errors — stream may already be errored/closed
    });
    return { text: "", bytesRead: 0, truncated: true };
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytesRead = 0;
  let truncated = false;

  try {
    while (bytesRead < maxBytes) {
      // reader.read() rejects when signal fires (deadline or caller abort)
      const { done, value } = await reader.read();
      if (done) break;
      const remaining = maxBytes - bytesRead;
      if (value.length <= remaining) {
        chunks.push(value);
        bytesRead += value.length;
        if (bytesRead === maxBytes) {
          // D-15: Peek one extra read to determine if stream is exhausted.
          // Without this peek, a stream that delivers exactly N bytes incorrectly returns
          // truncated: true. The peek distinguishes "exactly full" from "more data pending".
          const { done: isDone } = await reader.read();
          if (!isDone) truncated = true;
          break;
        }
      } else {
        // Chunk is larger than remaining budget — definitely truncated
        chunks.push(value.slice(0, remaining));
        bytesRead += remaining;
        truncated = true;
        break;
      }
    }
  } finally {
    // Non-negotiable: cancel the reader to release the TCP connection
    await reader.cancel().catch(() => {
      // Swallow cancel errors — they indicate the stream was already errored/closed
    });
  }

  // noUncheckedIndexedAccess: use for...of (not arr[i]) + Uint8Array.set() to avoid index access
  const all = new Uint8Array(bytesRead);
  let offset = 0;
  for (const chunk of chunks) {
    all.set(chunk, offset);
    offset += chunk.length;
  }

  // D-17: UTF-8 first, ISO-8859-1 (latin-1) fallback per SPEC §BodyPreview
  // fatal:true lets us detect invalid sequences and fall back; latin-1 never throws
  let text = "";
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(all);
  } catch {
    try {
      text = new TextDecoder("iso-8859-1").decode(all);
    } catch {
      // Swallow — preview text is best-effort
    }
  }

  return { text, bytesRead, truncated };
}
