const API_URL = 'https://omnia-api-447424955509.us-central1.run.app';

export interface Persona {
  id: string;
  name: string;
  description?: string;
  knowledgeBaseIds: string[];
  status: string;
  systemInstructions?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface DevicePersonaResponse {
  persona: Persona;
  device: {
    id: string;
    name: string;
    type: string;
  };
}

export interface ChatRequest {
  message: string;
  sessionId?: string;
}

export interface Citation {
  source: string;
  fileUri?: string;
}

export interface ChatResponse {
  answer: string;
  citations?: Citation[];
  sessionId?: string;
}

export interface ChatError {
  error: string;
  code: string;
  details?: any;
}

class ChatAPI {
  private baseURL: string;

  constructor() {
    this.baseURL = API_URL;
  }

  /**
   * Get persona assigned to a specific device
   */
  async getDevicePersona(deviceId: string): Promise<DevicePersonaResponse> {
    const url = `${this.baseURL}/api/devices/${deviceId}/persona`;
    console.log('[ChatAPI] Fetching device persona:', url);
    
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const contentType = response.headers.get('content-type');
      const isJson = contentType && contentType.includes('application/json');

      if (!response.ok) {
        let errorMessage = `Failed to fetch persona for device ${deviceId} (Status: ${response.status})`;
        
        if (isJson) {
          try {
            const error: ChatError = await response.json();
            errorMessage = error.error || errorMessage;
          } catch (e) {
            // If JSON parsing fails, use default message
          }
        } else {
          // If response is not JSON (likely HTML error page)
          const text = await response.text();
          console.log('[ChatAPI] Non-JSON response:', text.substring(0, 200));
          if (response.status === 404) {
            errorMessage = `Endpoint not found (404): ${url}\n\nPlease verify:\n• The endpoint exists on the API\n• The device ID is correct\n• The API is deployed and running`;
          } else if (response.status === 500) {
            errorMessage = `Server error (500). Please check if the API is running.`;
          } else {
            errorMessage = `API returned non-JSON response (Status: ${response.status}). URL: ${url}`;
          }
        }
        
        throw new Error(errorMessage);
      }

      if (!isJson) {
        throw new Error('API returned non-JSON response. Please check the API endpoint.');
      }

      return await response.json();
    } catch (error: any) {
      console.error('Error fetching device persona:', error);
      // Re-throw with more context if it's a network error
      if (error.message && error.message.includes('JSON')) {
        throw new Error('API endpoint may not exist or returned invalid response. Please verify the API URL and endpoint.');
      }
      throw error;
    }
  }

  /**
   * Send a message to a persona (for chat interface)
   */
  async sendMessage(personaId: string, message: string, sessionId?: string): Promise<ChatResponse> {
    const url = `${this.baseURL}/api/personas/${personaId}/chat`;
    console.log('[ChatAPI] Sending message to persona:', url);
    
    try {
      const body: ChatRequest = {
        message,
        ...(sessionId && { sessionId }),
      };

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      const contentType = response.headers.get('content-type');
      const isJson = contentType && contentType.includes('application/json');

      if (!response.ok) {
        let errorMessage = `Failed to send message (Status: ${response.status})`;
        
        if (isJson) {
          try {
            const error: ChatError = await response.json();
            errorMessage = error.error || errorMessage;
          } catch (e) {
            // If JSON parsing fails, use default message
          }
        } else {
          // If response is not JSON (likely HTML error page)
          const text = await response.text();
          console.log('[ChatAPI] Non-JSON response:', text.substring(0, 200));
          if (response.status === 404) {
            errorMessage = `Endpoint not found (404): ${url}\n\nPlease verify:\n• The endpoint exists on the API\n• The persona ID is correct\n• The API is deployed and running`;
          } else if (response.status === 500) {
            errorMessage = `Server error (500). Please check if the API is running.`;
          } else {
            errorMessage = `API returned non-JSON response (Status: ${response.status}). URL: ${url}`;
          }
        }
        
        throw new Error(errorMessage);
      }

      if (!isJson) {
        throw new Error('API returned non-JSON response. Please check the API endpoint.');
      }

      return await response.json();
    } catch (error: any) {
      console.error('Error sending message:', error);
      // Re-throw with more context if it's a JSON parsing error
      if (error.message && error.message.includes('JSON')) {
        throw new Error('API endpoint may not exist or returned invalid response. Please verify the API URL and endpoint.');
      }
      throw error;
    }
  }

  /**
   * Send a test message to a persona (for quick testing)
   */
  async testPersona(personaId: string, message: string = 'Hello, can you hear me?'): Promise<ChatResponse> {
    return this.sendMessage(personaId, message);
  }
}

export const chatAPI = new ChatAPI();

