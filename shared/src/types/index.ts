export type ApiSuccess<T> = {
  status: 'ok';
  data: T;
};

export type ApiError = {
  status: 'error';
  message: string;
  details?: unknown;
};

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

export type PaginationQuery = {
  page?: number;
  limit?: number;
};
