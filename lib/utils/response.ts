import { NextResponse } from "next/server";
import { ApiErrorResponse, ApiSuccessResponse } from "@/types/api";

export function successResponse<T>(
  data?: T,
  extra: Record<string, unknown> = {},
  status = 200
): NextResponse<ApiSuccessResponse<T>> {
  const payload: ApiSuccessResponse<T> = {
    success: true,
    ...(data !== undefined ? { data } : {}),
    ...extra,
  };
  return NextResponse.json(payload, { status });
}

export function errorResponse(
  code: string,
  message: string,
  status = 400,
  details?: unknown
): NextResponse<ApiErrorResponse> {
  const payload: ApiErrorResponse = {
    success: false,
    error: {
      code,
      message,
      ...(details !== undefined ? { details } : {}),
    },
  };
  return NextResponse.json(payload, { status });
}
