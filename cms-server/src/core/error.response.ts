"use strict";

import { ReasonPhrases, StatusCode } from "../utils/httpStatusCode";

class ErrorResponse extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

class ConflictRequestError extends ErrorResponse {
  constructor(
    message = ReasonPhrases.CONFLICT,
    statusCode = StatusCode.CONFLICT
  ) {
    super(message, statusCode);
  }
}

/**
 * 400 — the request itself is invalid (bad input, illegal state transition).
 *
 * The original demo had this default to 403/FORBIDDEN, which conflated
 * "your request is wrong" with "you are not allowed". Clients need to tell
 * those apart: the first is worth showing to the operator, the second means
 * the UI offered an action it should have hidden.
 */
class BadRequestError extends ErrorResponse {
  constructor(
    message = ReasonPhrases.BAD_REQUEST,
    statusCode = StatusCode.BAD_REQUEST
  ) {
    super(message, statusCode);
  }
}

class AuthFailureError extends ErrorResponse {
  constructor(
    message = ReasonPhrases.UNAUTHORIZED,
    statusCode = StatusCode.UNAUTHORIZED
  ) {
    super(message, statusCode);
  }
}

class NotFoundError extends ErrorResponse {
  constructor(
    message = ReasonPhrases.NOT_FOUND,
    statusCode = StatusCode.NOT_FOUND
  ) {
    super(message, statusCode);
  }
}

class ForbiddenError extends ErrorResponse {
  constructor(
    message = ReasonPhrases.FORBIDDEN,
    statusCode = StatusCode.FORBIDDEN
  ) {
    super(message, statusCode);
  }
}

class InternalServerError extends ErrorResponse {
  constructor(
    message = ReasonPhrases.INTERNAL_SERVER_ERROR,
    statusCode = StatusCode.INTERNAL_SERVER_ERROR
  ) {
    super(message, statusCode);
  }
}

class NotImplementedError extends ErrorResponse {
  constructor(
    message = ReasonPhrases.NOT_IMPLEMENTED,
    statusCode = StatusCode.NOT_IMPLEMENTED
  ) {
    super(message, statusCode);
  }
}

class BadGatewayError extends ErrorResponse {
  constructor(
    message = ReasonPhrases.BAD_GATEWAY,
    statusCode = StatusCode.BAD_GATEWAY
  ) {
    super(message, statusCode);
  }
}

class ServiceUnavailableError extends ErrorResponse {
  constructor(
    message = ReasonPhrases.SERVICE_UNAVAILABLE,
    statusCode = StatusCode.SERVICE_UNAVAILABLE
  ) {
    super(message, statusCode);
  }
}

class GatewayTimeoutError extends ErrorResponse {
  constructor(
    message = ReasonPhrases.GATEWAY_TIMEOUT,
    statusCode = StatusCode.GATEWAY_TIMEOUT
  ) {
    super(message, statusCode);
  }
}

export {
  ConflictRequestError,
  BadRequestError,
  AuthFailureError,
  NotFoundError,
  ForbiddenError,
  InternalServerError,
  NotImplementedError,
  BadGatewayError,
  ServiceUnavailableError,
  GatewayTimeoutError,
};
