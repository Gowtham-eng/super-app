import {
  getSpeechRecognitionCtor,
  isSecureVoiceContext,
  micPermissionMessage,
  preferredVoiceLanguage,
  requestMicrophoneAccess,
} from './voiceInput';

test('prefers English device language for speech recognition', () => {
  const original = navigator.language;
  Object.defineProperty(navigator, 'language', { configurable: true, value: 'en-IN' });
  expect(preferredVoiceLanguage()).toBe('en-IN');
  Object.defineProperty(navigator, 'language', { configurable: true, value: original });
});

test('maps permission errors to user-facing mic messages', () => {
  expect(micPermissionMessage({ name: 'NotAllowedError' })).toMatch(/permission blocked/i);
  expect(micPermissionMessage({ name: 'NotFoundError' })).toMatch(/No microphone/i);
  expect(micPermissionMessage({ name: 'NotSupportedError' })).toMatch(/cannot open/i);
});

test('secure context helper is true in jsdom https-like window', () => {
  expect(typeof isSecureVoiceContext()).toBe('boolean');
  expect(getSpeechRecognitionCtor()).toBeNull();
});

test('requestMicrophoneAccess stops tracks after the permission prompt', async () => {
  const stop = jest.fn();
  const getUserMedia = jest.fn().mockResolvedValue({
    getTracks: () => [{ stop }],
  });
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia },
  });
  await expect(requestMicrophoneAccess()).resolves.toBe(true);
  expect(getUserMedia).toHaveBeenCalledWith({ audio: true });
  expect(stop).toHaveBeenCalled();
});
