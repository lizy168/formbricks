export type HubError = { status: number; message: string; detail: string };

export type HubResult<T> = {
  data: T | null;
  error: HubError | null;
};

export const NO_CONFIG_ERROR = {
  status: 0,
  message: "HUB_API_KEY is not set; Hub integration is disabled.",
  detail: "HUB_API_KEY is not set; Hub integration is disabled.",
} as const;

export const getErrorMessage = (err: unknown): string => {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return "Unknown error";
};

// Duck-typed: `instanceof` against the SDK error class breaks under Next dev/Turbopack
// when @formbricks/hub is loaded into more than one module scope.
export const getErrorStatus = (err: unknown): number =>
  err && typeof err === "object" && typeof (err as { status?: unknown }).status === "number"
    ? (err as { status: number }).status
    : 0;

export const createHubResultFromError = <T>(err: unknown): HubResult<T> => {
  const status = getErrorStatus(err);
  const message = getErrorMessage(err);
  return { data: null, error: { status, message, detail: message } };
};

// Node network errnos meaning the Hub process was never reached, as opposed to Hub answering with
// an error. The SDK surfaces these as APIConnectionError with the original errno buried in the
// cause chain, so the message alone ("Connection error.") can't tell the two apart.
const CONNECTION_ERROR_CODES = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "ETIMEDOUT",
  "ENOTFOUND",
  "EAI_AGAIN",
  "EHOSTUNREACH",
]);

// Deliberately a constant. The errno is what gets inspected; nothing from the error (host, port,
// syscall) is interpolated, so this can never carry connection details into a log line.
const HUB_UNREACHABLE_HINT =
  "Hub looks unreachable at HUB_API_URL — is it running? Try: docker logs formbricks-hub-1";

// Walks `cause` and AggregateError.errors looking for a network errno. Node's fetch failure nests
// them two or three deep (APIConnectionError → TypeError: fetch failed → AggregateError → errno),
// and the depth cap keeps a self-referencing cause from looping forever.
const hasConnectionErrno = (err: unknown, depth = 0): boolean => {
  if (!err || typeof err !== "object" || depth > 8) return false;

  const { code, errors, cause } = err as { code?: unknown; errors?: unknown; cause?: unknown };

  if (typeof code === "string" && CONNECTION_ERROR_CODES.has(code)) return true;

  if (Array.isArray(errors) && errors.some((nested) => hasConnectionErrno(nested, depth + 1))) {
    return true;
  }

  return hasConnectionErrno(cause, depth + 1);
};

/**
 * A greppable hint for the case where a Hub call failed because Hub itself wasn't reachable —
 * the failure mode that otherwise shows up only as a generic "fetch failed" with no clue that the
 * Hub container is the thing to look at. Returns undefined for every other failure.
 *
 * Log-only. Never put this into `HubError.message`/`detail`: those travel through server actions
 * to the browser, and this is internal deployment detail.
 */
export const getHubErrorHint = (err: unknown): string | undefined =>
  hasConnectionErrno(err) ? HUB_UNREACHABLE_HINT : undefined;
