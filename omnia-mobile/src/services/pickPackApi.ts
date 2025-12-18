import {
  PickOrder,
  ScanResponse,
  GetPickOrderResponse,
  SubmitScanRequest,
  CompletePickOrderResponse,
} from '../types/pickPack';

// Same API URL as chat API - Pick-Pack endpoints are on the same server
const API_URL = 'https://omnia-api-447424955509.us-central1.run.app';

export interface PickPackError {
  error: string;
  code: string;
  details?: any;
}

class PickPackAPI {
  private baseURL: string;

  constructor() {
    this.baseURL = API_URL;
  }

  /**
   * Get user's active pick order
   * GET /api/pickpack/picks/user/:userId
   */
  async getUserActivePickOrder(userId: string): Promise<PickOrder | null> {
    const url = `${this.baseURL}/api/pickpack/picks/user/${userId}`;
    console.log('[PickPackAPI] Fetching active pick order:', url);

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
        let errorMessage = `Failed to fetch pick order for user ${userId} (Status: ${response.status})`;

        if (isJson) {
          try {
            const error: PickPackError = await response.json();
            errorMessage = error.error || errorMessage;
          } catch (e) {
            // If JSON parsing fails, use default message
          }
        } else {
          const text = await response.text();
          console.log('[PickPackAPI] Non-JSON response:', text.substring(0, 200));
          if (response.status === 404) {
            // 404 might mean no active pick order - return null
            console.log('[PickPackAPI] No active pick order found');
            return null;
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

      // API returns the pick order directly, not wrapped in { pickOrder: ... }
      const pickOrder: PickOrder = await response.json();
      console.log('[PickPackAPI] Pick order received:', pickOrder);
      return pickOrder;
    } catch (error: any) {
      console.error('Error fetching active pick order:', error);
      if (error.message && error.message.includes('JSON')) {
        throw new Error('API endpoint may not exist or returned invalid response. Please verify the API URL and endpoint.');
      }
      throw error;
    }
  }

  /**
   * Submit a UPC scan for validation
   * POST /api/pickpack/picks/:pickId/scan
   */
  async submitScan(pickId: string, upc: string): Promise<ScanResponse> {
    const url = `${this.baseURL}/api/pickpack/picks/${pickId}/scan`;
    console.log('[PickPackAPI] Submitting scan:', url, { upc });

    try {
      const body: SubmitScanRequest = { upc };

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
        let errorMessage = `Failed to submit scan (Status: ${response.status})`;

        if (isJson) {
          try {
            const error: PickPackError = await response.json();
            errorMessage = error.error || errorMessage;
          } catch (e) {
            // If JSON parsing fails, use default message
          }
        } else {
          const text = await response.text();
          console.log('[PickPackAPI] Non-JSON response:', text.substring(0, 200));
          if (response.status === 404) {
            errorMessage = `Pick order not found (404): ${url}`;
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
      console.error('Error submitting scan:', error);
      if (error.message && error.message.includes('JSON')) {
        throw new Error('API endpoint may not exist or returned invalid response. Please verify the API URL and endpoint.');
      }
      throw error;
    }
  }

  /**
   * Mark a pick order as complete
   * POST /api/pickpack/picks/:pickId/complete
   */
  async completePickOrder(pickId: string): Promise<CompletePickOrderResponse> {
    const url = `${this.baseURL}/api/pickpack/picks/${pickId}/complete`;
    console.log('[PickPackAPI] Completing pick order:', url);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const contentType = response.headers.get('content-type');
      const isJson = contentType && contentType.includes('application/json');

      if (!response.ok) {
        let errorMessage = `Failed to complete pick order (Status: ${response.status})`;

        if (isJson) {
          try {
            const error: PickPackError = await response.json();
            errorMessage = error.error || errorMessage;
          } catch (e) {
            // If JSON parsing fails, use default message
          }
        } else {
          const text = await response.text();
          console.log('[PickPackAPI] Non-JSON response:', text.substring(0, 200));
          if (response.status === 404) {
            errorMessage = `Pick order not found (404): ${url}`;
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
      console.error('Error completing pick order:', error);
      if (error.message && error.message.includes('JSON')) {
        throw new Error('API endpoint may not exist or returned invalid response. Please verify the API URL and endpoint.');
      }
      throw error;
    }
  }

  /**
   * Get pick order details
   * GET /api/pickpack/picks/:pickId
   */
  async getPickOrderDetails(pickId: string): Promise<PickOrder> {
    const url = `${this.baseURL}/api/pickpack/picks/${pickId}`;
    console.log('[PickPackAPI] Fetching pick order details:', url);

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
        let errorMessage = `Failed to fetch pick order details (Status: ${response.status})`;

        if (isJson) {
          try {
            const error: PickPackError = await response.json();
            errorMessage = error.error || errorMessage;
          } catch (e) {
            // If JSON parsing fails, use default message
          }
        } else {
          const text = await response.text();
          console.log('[PickPackAPI] Non-JSON response:', text.substring(0, 200));
          if (response.status === 404) {
            errorMessage = `Pick order not found (404): ${url}`;
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
      console.error('Error fetching pick order details:', error);
      if (error.message && error.message.includes('JSON')) {
        throw new Error('API endpoint may not exist or returned invalid response. Please verify the API URL and endpoint.');
      }
      throw error;
    }
  }
}

export const pickPackAPI = new PickPackAPI();
