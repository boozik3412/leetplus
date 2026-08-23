import {
  json,
  type ErrorRequestHandler,
  type RequestHandler,
  type Response,
} from 'express';

export const INVITE_SECRET_REQUEST_LIMIT = '4kb';
const INVITE_REQUEST_ERROR_MESSAGE = 'Некорректный запрос приглашения';
const PARSER_ERROR_STATUSES = new Set([400, 413, 415]);

export function inviteSecretContentTypeGuard(): RequestHandler {
  return (request, response, next) => {
    if (request.method !== 'POST') {
      next();
      return;
    }

    const mediaType = request
      .get('content-type')
      ?.split(';', 1)[0]
      ?.trim()
      .toLowerCase();
    if (mediaType !== 'application/json') {
      rejectInviteRequest(
        response,
        415,
        'INVITE_REQUEST_MEDIA_TYPE_INVALID',
      );
      return;
    }
    next();
  };
}

export function inviteSecretJsonParser(): RequestHandler {
  const parser = json({
    limit: INVITE_SECRET_REQUEST_LIMIT,
    strict: true,
    type: 'application/json',
  });
  return (request, response, next) => {
    if (request.method !== 'POST') {
      next();
      return;
    }
    parser(request, response, next);
  };
}

export function inviteSecretParserErrorHandler(): ErrorRequestHandler {
  return (error: unknown, _request, response, next) => {
    const status = bodyParserErrorStatus(error);
    if (!status) {
      next(error);
      return;
    }

    rejectInviteRequest(
      response,
      status,
      status === 413
        ? 'INVITE_REQUEST_TOO_LARGE'
        : 'INVITE_REQUEST_BODY_INVALID',
    );
  };
}

function rejectInviteRequest(
  response: Response,
  status: number,
  reasonCode: string,
): void {
  response.setHeader('Cache-Control', 'private, no-store, max-age=0');
  response.setHeader('Pragma', 'no-cache');
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  response.status(status).json({
    message: INVITE_REQUEST_ERROR_MESSAGE,
    reasonCode,
  });
}

function bodyParserErrorStatus(error: unknown): number | null {
  if (!error || typeof error !== 'object' || !('type' in error)) {
    return null;
  }

  const statusCandidate =
    'status' in error && typeof error.status === 'number'
      ? error.status
      : 'statusCode' in error && typeof error.statusCode === 'number'
        ? error.statusCode
        : null;

  return statusCandidate && PARSER_ERROR_STATUSES.has(statusCandidate)
    ? statusCandidate
    : null;
}
