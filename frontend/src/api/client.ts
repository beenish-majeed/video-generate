import type {
  DurationsResponse,
  AssetUploadResponse,
  AssetKind,
  JobCreatePayload,
  JobRecord,
} from '../types/api';

/**
 * Typed API Client Skeleton for Video Generation Backend.
 * Uses relative `/api` path so the Vite dev proxy handles authorization header injection.
 * API_KEY is NEVER exposed to browser code.
 */
class MemoryStudioAPIClient {
  private baseUrl: string;

  constructor(baseUrl: string = '/api') {
    this.baseUrl = baseUrl;
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const headers = new Headers(options.headers || {});

    // Note: No X-API-Key set here! The Vite Proxy / Production reverse proxy injects X-API-Key.
    if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
      headers.set('Content-Type', 'application/json');
    }

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      let errorMessage = `HTTP Error ${response.status}: ${response.statusText}`;
      try {
        const errorData = await response.json();
        if (typeof errorData.detail === 'string') {
          errorMessage = errorData.detail;
        } else if (Array.isArray(errorData.detail)) {
          errorMessage = errorData.detail.map((e: { msg: string }) => e.msg).join(', ');
        } else if (errorData.message) {
          errorMessage = errorData.message;
        }
      } catch {
        // Fallback to generic HTTP status message
      }
      throw new Error(errorMessage);
    }

    return response.json() as Promise<T>;
  }

  /**
   * GET /v1/durations
   * Retrieves word rate, duration bounds, and allowed presets.
   */
  async getDurations(): Promise<DurationsResponse> {
    return this.request<DurationsResponse>('/v1/durations');
  }

  /**
   * POST /v1/assets/upload
   * Uploads photo or voice asset via multipart/form-data with optional progress reporting.
   */
  async uploadAsset(
    kind: AssetKind,
    file: File,
    onProgress?: (percent: number) => void
  ): Promise<AssetUploadResponse> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const url = `${this.baseUrl}/v1/assets/upload`;

      xhr.open('POST', url);

      if (xhr.upload && onProgress) {
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            const percent = Math.round((e.loaded / e.total) * 100);
            onProgress(percent);
          }
        };
      }

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const res = JSON.parse(xhr.responseText) as AssetUploadResponse;
            resolve(res);
          } catch {
            reject(new Error('Failed to parse upload response from server'));
          }
        } else {
          let msg = `HTTP Error ${xhr.status}: ${xhr.statusText}`;
          try {
            const json = JSON.parse(xhr.responseText);
            if (typeof json.detail === 'string') {
              msg = json.detail;
            } else if (Array.isArray(json.detail)) {
              msg = json.detail.map((d: any) => d.msg).join(', ');
            }
          } catch {
            // Keep generic HTTP status message
          }
          reject(new Error(msg));
        }
      };

      xhr.onerror = () => {
        reject(new Error('Network error: Failed to fetch asset upload endpoint'));
      };

      const formData = new FormData();
      formData.append('kind', kind);
      formData.append('file', file);

      xhr.send(formData);
    });
  }

  /**
   * POST /v1/jobs
   * Submits new video creation job.
   */
  async createJob(payload: JobCreatePayload): Promise<JobRecord> {
    return this.request<JobRecord>('/v1/jobs', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  /**
   * GET /v1/jobs/{id}
   * Retrieves current job status and segment progress array.
   */
  async getJob(jobId: string): Promise<JobRecord> {
    return this.request<JobRecord>(`/v1/jobs/${jobId}`);
  }

  /**
   * Returns the direct download URL for completed video result.
   */
  getDownloadUrl(jobId: string): string {
    return `${this.baseUrl}/v1/jobs/${jobId}/download`;
  }
}

export const apiClient = new MemoryStudioAPIClient();
export default apiClient;
