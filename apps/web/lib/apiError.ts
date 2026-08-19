/**
 * The message from a failed RTK Query call.
 *
 * The server owns the rules that produce these (uniqueness, role validity,
 * permissions), so its `detail` is the accurate thing to show a user; the
 * fallback is only for transport failures that carry no body.
 */
export function apiError(error: unknown, fallback: string): string {
  const detail = (error as { data?: { detail?: unknown } })?.data?.detail;
  if (typeof detail === 'string') return detail;
  // FastAPI validation errors arrive as a list of {msg, loc}.
  if (Array.isArray(detail) && detail.length > 0) {
    const first = detail[0] as { msg?: string };
    if (first?.msg) return first.msg;
  }
  return fallback;
}
