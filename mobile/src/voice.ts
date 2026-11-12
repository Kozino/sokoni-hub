/**
 * Voice for Sokoni Assistant. Typing always works.
 * - Web: Web Speech API (no audio leaves the device until the transcript is sent as chat)
 * - Native: expo-av records while the button is held; audio is posted for STT then discarded
 * - TTS: expo-speech, on-device
 */
import { Platform } from 'react-native';
import type { LocaleCode } from './i18n';

const SPEECH_LANG: Record<LocaleCode, string> = {
  en: 'en-US',
  sw: 'sw-KE',
  lg: 'en-UG',
  tw: 'en-GH',
  ar: 'ar-QA',
};

type RecordingHandle = { stop: () => Promise<string | null> };

export async function speak(text: string, locale: LocaleCode) {
  try {
    const Speech = await import('expo-speech');
    Speech.stop();
    Speech.speak(text.slice(0, 400), { language: SPEECH_LANG[locale], pitch: 1, rate: 0.95 });
  } catch { /* TTS is optional */ }
}

export function stopSpeaking() {
  void import('expo-speech').then((Speech) => Speech.stop()).catch(() => {});
}

export async function webListen(locale: LocaleCode): Promise<string | null> {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  if (!SR) return null;
  return new Promise((resolve) => {
    const rec = new SR();
    rec.lang = SPEECH_LANG[locale];
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (event: any) => resolve(String(event.results?.[0]?.[0]?.transcript || '').trim() || null);
    rec.onerror = () => resolve(null);
    rec.onend = () => {};
    try { rec.start(); } catch { resolve(null); }
  });
}

export async function startNativeRecording(): Promise<RecordingHandle | null> {
  if (Platform.OS === 'web') return null;
  try {
    const { Audio } = await import('expo-av');
    const perm = await Audio.requestPermissionsAsync();
    if (!perm.granted) return null;
    await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
    const recording = new Audio.Recording();
    await recording.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
    await recording.startAsync();
    return {
      stop: async () => {
        try {
          await recording.stopAndUnloadAsync();
          await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
          return recording.getURI();
        } catch { return null; }
      },
    };
  } catch {
    return null;
  }
}
