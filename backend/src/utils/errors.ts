export class HttpError extends Error {
  constructor(public status: number, message: string, public code?: string, public details?: unknown) {
    super(message);
  }
}
export const badRequest   = (m='Bad request', d?: unknown) => new HttpError(400, m, 'bad_request', d);
export const unauthorized = (m='Unauthorized')             => new HttpError(401, m, 'unauthorized');
export const forbidden    = (m='Forbidden')                => new HttpError(403, m, 'forbidden');
export const notFound     = (m='Not found')                => new HttpError(404, m, 'not_found');
export const conflict     = (m='Conflict')                 => new HttpError(409, m, 'conflict');
