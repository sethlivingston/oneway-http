import { describe, it } from "vitest";

// Stubs for Phase 7 Typed Matcher tests.
// Filled out in 07-02-PLAN (Wave 2) after src/matcher.ts is implemented.

describe("MATCH-01: Send.match — response dispatch", () => {
  it.todo("calls the tagged response handler for kind='response' with tag='ok'");
  it.todo("dispatches to the correct tag when response tag is 'notFound'");
});

describe("MATCH-01: Send.match — transportError dispatch", () => {
  it.todo("calls transportError handler for kind='transportError'");
});

describe("MATCH-01: Send.match — decodeError dispatch", () => {
  it.todo("calls decodeError handler with error, status, headers, preview");
});

describe("MATCH-01: Send.match — unhandledStatus dispatch", () => {
  it.todo("calls unhandledStatus handler with status, headers, preview");
});

describe("MATCH-01: Send.match — requestError dispatch", () => {
  it.todo("calls requestError handler for kind='requestError'");
});

describe("MATCH-02: Matcher exhaustiveness — compile-time enforcement", () => {
  it.todo("compile-time: missing tagged response handler is a TypeScript error (@ts-expect-error test in Wave 2)");
  it.todo("compile-time: missing requestError handler is a TypeScript error (@ts-expect-error test in Wave 2)");
});

describe("MATCH-03: handler composability with Partial<Matcher<R,T>> + spread", () => {
  it.todo("composes error handler fragment via object spread at Send.match() call site");
});
