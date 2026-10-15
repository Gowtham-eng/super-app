/** Mobile + WebView voice helpers. Does not change login or ITSM matchers. */

export function getSpeechRecognitionCtor() {
  if (typeof window === 'undefined') return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

export function isSecureVoiceContext() {
  if (typeof window === 'undefined') return false;
  return Boolean(window.isSecureContext) || window.location?.hostname === 'localhost';
}

export function isMobileVoiceClient() {
  if (typeof navigator === 'undefined') return false;
  return (
    /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '')
    || (navigator.maxTouchPoints > 1 && /Mac/.test(navigator.platform || ''))
  );
}

export function preferredVoiceLanguage() {
  const preferredLang = (typeof navigator !== 'undefined' ? navigator.language : '') || '';
  const trimmed = preferredLang.trim();
  return trimmed && /^en([-_]|$)/i.test(trimmed) ? trimmed : 'en-US';
}

/** Ask the OS for the microphone. SpeechRecognition on Android/iOS does not show a prompt by itself. */
export async function requestMicrophoneAccess() {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    const err = new Error('Microphone API is not available');
    err.name = 'NotSupportedError';
    throw err;
  }
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  (stream.getTracks() || []).forEach((track) => {
    try {
      track.stop();
    } catch {
      /* already closed */
    }
  });
  return true;
}

export function micPermissionMessage(error) {
  const name = String(error?.name || '');
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'SecurityError') {
    return 'Microphone permission blocked. Allow mic access in the browser or device settings and try again.';
  }
  if (name === 'NotFoundError') {
    return 'No microphone found. Check device settings and try again.';
  }
  if (name === 'NotSupportedError') {
    return 'This device cannot open the microphone.';
  }
  return 'Could not access the microphone. Check device settings and try again.';
}
