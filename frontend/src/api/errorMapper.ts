/**
 * Maps raw API/Network errors into kind, empathetic human messages.
 */

export interface MappedAPIError {
  title: string;
  message: string;
  kind: 'network' | 'validation' | 'auth' | 'too_large' | 'server' | 'unknown';
}

export function mapAPIError(error: unknown): MappedAPIError {
  // Check if browser is offline
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return {
      title: 'Studio Connection Lost',
      message: 'It seems you are offline right now. Please check your network connection and try again.',
      kind: 'network',
    };
  }

  const errStr = error instanceof Error ? error.message : String(error);
  const lower = errStr.toLowerCase();

  // Network or Connection Error
  if (
    lower.includes('failed to fetch') ||
    lower.includes('networkerror') ||
    lower.includes('net::err') ||
    lower.includes('network error')
  ) {
    return {
      title: 'Connection Hiccup',
      message: 'We could not reach the Memory Studio server. Please check that the server is running and try again.',
      kind: 'network',
    };
  }

  // 413 Payload Too Large
  if (lower.includes('413') || lower.includes('too large') || lower.includes('payload too large')) {
    return {
      title: 'File is a Bit Too Large',
      message: 'This photo exceeds our 20MB limit. Please select a slightly smaller image file.',
      kind: 'too_large',
    };
  }

  // 401 / 403 Auth Error
  if (lower.includes('401') || lower.includes('403') || lower.includes('unauthorized')) {
    return {
      title: 'Studio Keys Unverified',
      message: 'The studio authorization key could not be verified. Please check server configuration.',
      kind: 'auth',
    };
  }

  // 400 Bad Request / Validation
  if (lower.includes('400') || lower.includes('bad request') || lower.includes('invalid file') || lower.includes('mime')) {
    return {
      title: 'Photo Format Not Recognized',
      message: 'We could not read this image file. Please upload a standard PNG, JPG, or WEBP portrait.',
      kind: 'validation',
    };
  }

  // 500 / 5xx Server Error
  if (
    lower.includes('500') ||
    lower.includes('502') ||
    lower.includes('503') ||
    lower.includes('internal server error')
  ) {
    return {
      title: 'Studio Server Pause',
      message: 'The studio easel ran into a brief hiccup while saving your photo. Please try uploading once more.',
      kind: 'server',
    };
  }

  return {
    title: 'Upload Note',
    message: errStr || 'An unexpected note occurred while uploading your photo.',
    kind: 'unknown',
  };
}
