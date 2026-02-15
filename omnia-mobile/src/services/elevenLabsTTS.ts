import { NativeModules } from 'react-native';

const { MetaWearablesModule } = NativeModules;

const API_KEY = process.env.ELEVENLABS_API_KEY || '';
const VOICE_ID = process.env.ELEVENLABS_VOICE_ID || '';
const API_URL = `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`;

class ElevenLabsTTS {
  async speak(text: string): Promise<void> {
    if (!API_KEY || !VOICE_ID) {
      console.warn('ElevenLabs TTS: Missing API key or voice ID, skipping speech');
      return;
    }

    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'xi-api-key': API_KEY,
          'Content-Type': 'application/json',
          'Accept': 'audio/mpeg',
        },
        body: JSON.stringify({
          text,
          model_id: 'eleven_flash_v2_5',
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
          },
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text().catch(() => '');
        console.warn(`ElevenLabs TTS: API error ${response.status}`, errorBody);
        return;
      }

      // Convert response to base64 and play through native module
      // This uses the same AVAudioSession the Meta SDK already manages
      const arrayBuffer = await response.arrayBuffer();
      const base64 = arrayBufferToBase64(arrayBuffer);
      await MetaWearablesModule.playAudioData(base64);
    } catch (error) {
      console.warn('ElevenLabs TTS: Error during speech', error);
    }
  }
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return global.btoa(binary);
}

export const elevenLabsTTS = new ElevenLabsTTS();
