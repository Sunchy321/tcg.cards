/** ORPC and raw HTTP error code mapping for hsdata import job service failures. */
export function getHsdataImportJobErrorCode(message: string): 'NOT_FOUND' | 'CONFLICT' | 'BAD_REQUEST' {
  if (
    message.includes('does not exist')
    || message.includes('is not registered')
  ) {
    return 'NOT_FOUND';
  }

  if (
    message.includes('already has an active import job')
    || message.includes('is already being processed')
    || message.includes('is not accepting chunk uploads')
    || message.includes('cannot be finalized from status')
    || message.includes('is missing completed chunks')
    || message.includes('completed without a report')
  ) {
    return 'CONFLICT';
  }

  return 'BAD_REQUEST';
}
