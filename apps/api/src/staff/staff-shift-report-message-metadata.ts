export const STAFF_SHIFT_REPORT_MARKER_PREFIX = '[leetplus:shift-report:';
export const STAFF_SHIFT_REPORT_MESSAGE_MAX_LENGTH = 12000;

const STAFF_SHIFT_REPORT_MARKER_PATTERN =
  /\n*\[leetplus:shift-report:([^\]\s]{1,120})\]\s*$/i;

export function readShiftReportMessageShiftId(body: string) {
  return body.match(STAFF_SHIFT_REPORT_MARKER_PATTERN)?.[1] ?? null;
}

export function stripShiftReportMessageMetadata(body: string) {
  return body.replace(STAFF_SHIFT_REPORT_MARKER_PATTERN, '').trimEnd();
}

export function appendShiftReportMessageMetadata(
  body: string,
  shiftId: string | null | undefined,
  maxLength = STAFF_SHIFT_REPORT_MESSAGE_MAX_LENGTH,
) {
  const cleanBody = stripShiftReportMessageMetadata(body);

  if (!shiftId) {
    return cleanBody.slice(0, maxLength).trimEnd();
  }

  const marker = `${STAFF_SHIFT_REPORT_MARKER_PREFIX}${shiftId}]`;
  const bodyMaxLength = Math.max(0, maxLength - marker.length - 2);
  const clippedBody = cleanBody.slice(0, bodyMaxLength).trimEnd();

  return `${clippedBody}\n\n${marker}`;
}
