import { describe, expect, test } from "vitest";
import { getHubErrorHint } from "./utils";

// The fixtures below mirror the chain the real @formbricks/hub SDK produces, captured by driving it
// against a closed port: APIConnectionError (message "Connection error.", no code) wrapping
// TypeError "fetch failed" wrapping the Node error that actually carries the errno. When the Hub
// host resolves to more than one address, Node inserts an AggregateError and the errno lives in
// `errors[]` instead — both shapes have to be recognized, hence the two positive cases.
const withCause = (message: string, cause: unknown): Error => {
  const err = new Error(message);
  (err as { cause?: unknown }).cause = cause;
  return err;
};

const errnoError = (code: string): Error => {
  const err = new Error(`connect ${code} 127.0.0.1:8080`);
  (err as { code?: string }).code = code;
  return err;
};

const sdkConnectionError = (innermost: unknown): Error =>
  withCause("Connection error.", withCause("fetch failed", innermost));

describe("getHubErrorHint", () => {
  test("flags a single-address connection refusal", () => {
    expect(getHubErrorHint(sdkConnectionError(errnoError("ECONNREFUSED")))).toContain(
      "Hub looks unreachable"
    );
  });

  test("flags a multi-address refusal, where the errno sits inside AggregateError.errors", () => {
    const aggregate = new AggregateError(
      [errnoError("ECONNREFUSED"), errnoError("ECONNREFUSED")],
      "all connection attempts failed"
    );

    expect(getHubErrorHint(sdkConnectionError(aggregate))).toContain("Hub looks unreachable");
  });

  test.each(["ECONNRESET", "ETIMEDOUT", "ENOTFOUND", "EAI_AGAIN", "EHOSTUNREACH"])("flags %s", (code) => {
    expect(getHubErrorHint(sdkConnectionError(errnoError(code)))).toBeDefined();
  });

  // A Hub that answers with an error is reachable, so the hint would send readers to the wrong
  // place — this is the distinction the whole helper exists to make.
  test("stays quiet when Hub answered with an API error", () => {
    const apiError = new Error("Feedback directory not found");
    (apiError as { status?: number }).status = 404;

    expect(getHubErrorHint(apiError)).toBeUndefined();
  });

  test("stays quiet for an unrelated failure, a bare string and nullish input", () => {
    expect(getHubErrorHint(new Error("value_text must not be empty"))).toBeUndefined();
    expect(getHubErrorHint("Connection error.")).toBeUndefined();
    expect(getHubErrorHint(null)).toBeUndefined();
    expect(getHubErrorHint(undefined)).toBeUndefined();
  });

  // Node blocks a handful of ports before any socket work, which surfaces as a causeless
  // "bad port" — reachability is genuinely unknown there, so it must not claim Hub is down.
  test("stays quiet for a bad-port failure, which carries no errno", () => {
    expect(getHubErrorHint(sdkConnectionError(new Error("bad port")))).toBeUndefined();
  });

  test("terminates on a self-referencing cause chain", () => {
    const looping = new Error("loops");
    (looping as { cause?: unknown }).cause = looping;

    expect(getHubErrorHint(looping)).toBeUndefined();
  });

  test("carries no connection details, so it cannot leak host or port into logs", () => {
    const hint = getHubErrorHint(sdkConnectionError(errnoError("ECONNREFUSED")));

    expect(hint).not.toContain("127.0.0.1");
    expect(hint).not.toContain("8080");
  });
});
