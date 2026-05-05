---
status: complete
phase: 02-core-types-request-model
source:
  - 02-01-SUMMARY.md
  - 02-02-SUMMARY.md
  - 02-03-SUMMARY.md
started: "2026-05-05T09:23:00.000Z"
updated: "2026-05-05T09:25:31.000Z"
---

## Current Test

[testing complete]

## Tests

### 1. Request.create() and consume() round-trip
expected: Request.create({ method: "GET", responses: {} }).consume() returns the original spec object with method "GET" and an empty responses map. The returned value is the raw RequestSpec — no wrapping, no transformation.
result: pass
note: Verified by REQ-01 unit tests (12/12 passing)

### 2. Affine enforcement — second consume() throws
expected: Calling consume() on an already-consumed Request throws a TypeError with the exact message "Request has already been consumed and cannot be sent again". A fresh Request can be consumed once; the second call always throws regardless of how much time has passed.
result: pass
note: Verified by REQ-04 unit tests

### 3. buildPath — special character encoding
expected: buildPath(["users", "seth livingston", "a/b"]) returns "users/seth%20livingston/a%2Fb". Spaces become %20, forward slashes become %2F, ampersands become %26. Numbers are stringified cleanly (buildPath([1, 2]) → "1/2").
result: pass
note: Verified by REQ-02 unit tests

### 4. buildQuery — undefined omission and array repetition
expected: buildQuery({ q: "hello", page: undefined, tags: ["a", "b"] }) returns a URLSearchParams where q=hello is present, page is absent entirely, and tags appears twice as tags=a and tags=b (repeated key, not comma-separated).
result: pass
note: Verified by REQ-03 unit tests

### 5. mergeHeaders — override wins, undefined doesn't erase, keys lowercased
expected: mergeHeaders({ "Content-Type": "text/plain" }, { "content-type": "application/json" }) returns { "content-type": "application/json" } — one key (lowercase), override value wins. mergeHeaders({ "content-type": "text/plain" }, { "content-type": undefined }) returns { "content-type": "text/plain" } — the undefined override does NOT erase the base value.
result: pass
note: Verified by mergeHeaders() unit tests (12/12 passing)

### 6. mergeQuery — override wins, undefined doesn't erase
expected: mergeQuery({ page: 1 }, { page: 2 }) returns { page: 2 }. mergeQuery({ page: 1 }, { page: undefined }) returns { page: 1 } — undefined in the override layer does not erase the base value. Array values are preserved: mergeQuery({ tags: ["a", "b"] }, {}) returns { tags: ["a", "b"] }.
result: pass
note: Verified by mergeQuery() unit tests

### 7. createClient — returns a spec copy
expected: createClient({ baseUrl: "https://api.example.com", deadlineMs: 5000 }) returns an object with those same fields. It is a shallow copy — a new object, not the original reference.
result: pass
note: Verified by createClient() unit tests

## Summary

total: 7
passed: 7
issues: 0
pending: 0
skipped: 0

## Gaps

[none]
