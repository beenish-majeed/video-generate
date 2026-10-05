/**
 * Maps raw API/Network/HTTP errors into kind, empathetic human messages.
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
      message: 'This file exceeds our 20MB limit. Please select a slightly smaller file.',
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

  // 422 Unprocessable Entity (e.g. Script length mismatch or validation failure)
  if (
    lower.includes('422') ||
    lower.includes('unprocessable') ||
    lower.includes('mismatch') ||
    lower.includes('duration')
  ) {
    return {
      title: 'Script Pacing Mismatch',
      message: errStr.includes('HTTP Error 422')
        ? 'The narrative script duration does not match the chosen video duration. Please adjust your script length.'
        : errStr,
      kind: 'validation',
    };
  }

  // 400 Bad Request / Validation
  if (lower.includes('400') || lower.includes('bad request') || lower.includes('invalid file') || lower.includes('mime')) {
    return {
      title: 'Format Not Recognized',
      message: 'We could not process this input. Please verify your selected assets and text.',
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
      message: 'The studio easel ran into a brief hiccup while processing. Please try submitting once more.',
      kind: 'server',
    };
  }

  return {
    title: 'Studio Note',
    message: errStr || 'An unexpected note occurred.',
    kind: 'unknown',
  };
}
