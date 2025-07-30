/**
 * Base API client with common functionality
 * Handles authentication, error handling, and retry logic
 */

import { requestUrl } from 'obsidian';
import { Logger } from '../../utils/Logger';

export interface ApiConfig {
	baseUrl: string;
	apiKey: string;
	maxRetries?: number;
	retryDelay?: number;
	timeout?: number;
}

export interface ApiError {
	status: number;
	message: string;
	code?: string;
	details?: any;
}

export abstract class ApiClient {
	protected config: ApiConfig;
	private readonly defaultMaxRetries = 3;
	private readonly defaultRetryDelay = 1000; // 1 second
	private readonly defaultTimeout = 90000; // 90 seconds
	protected logger = Logger.getLogger('ApiClient');

	constructor(config: ApiConfig) {
		this.config = {
			maxRetries: this.defaultMaxRetries,
			retryDelay: this.defaultRetryDelay,
			timeout: this.defaultTimeout,
			...config
		};
		
		this.logger.debug('ApiClient initialized', { 
			baseUrl: config.baseUrl,
			timeout: this.config.timeout
		});
	}

	/**
	 * Make an authenticated POST request
	 */
	protected async post<T>(
		endpoint: string,
		data: FormData | Record<string, any>,
		options: RequestInit = {},
		signal?: AbortSignal
	): Promise<T> {
		const url = `${this.config.baseUrl}${endpoint}`;
		
		const headers: Record<string, string> = {
			'Authorization': `Bearer ${this.config.apiKey}`
		};
		

		// Add custom headers if provided
		if (options.headers) {
			Object.assign(headers, options.headers);
		}

		// Don't set Content-Type for FormData (browser will set it with boundary)
		if (!(data instanceof FormData)) {
			headers['Content-Type'] = 'application/json';
		}

		const requestOptions: RequestInit = {
			method: 'POST',
			headers,
			body: data instanceof FormData ? data : JSON.stringify(data),
			signal,
			...options
		};

		return this.executeWithRetry<T>(url, requestOptions);
	}

	/**
	 * Make an authenticated GET request
	 */
	protected async get<T>(
		endpoint: string,
		params?: Record<string, string>,
		signal?: AbortSignal
	): Promise<T> {
		const url = new URL(`${this.config.baseUrl}${endpoint}`);
		
		if (params) {
			Object.entries(params).forEach(([key, value]) => {
				url.searchParams.append(key, value);
			});
		}

		const requestOptions: RequestInit = {
			method: 'GET',
			headers: {
				'Authorization': `Bearer ${this.config.apiKey}`
			},
			signal
		};

		return this.executeWithRetry<T>(url.toString(), requestOptions);
	}

	/**
	 * Execute request with retry logic
	 */
	private async executeWithRetry<T>(
		url: string,
		options: RequestInit,
		retryCount = 0
	): Promise<T> {
		try {
			// Handle different body types for requestUrl
			let body: string | ArrayBuffer | undefined;
			const headers = options.headers as Record<string, string> || {};
			
			if (options.body instanceof FormData) {
				// Convert FormData to ArrayBuffer for requestUrl compatibility
				const boundary = `----ObsidianBoundary${Date.now()}`;
				const chunks: Uint8Array[] = [];
				const encoder = new TextEncoder();
				
				// Build multipart/form-data manually
				const formData = options.body as FormData;
				if (typeof FormData.prototype.entries === 'function') {
					for (const [key, value] of formData.entries()) {
						chunks.push(encoder.encode(`--${boundary}\r\n`));
						
						if (value instanceof File) {
							// Handle file fields
							chunks.push(encoder.encode(`Content-Disposition: form-data; name="${key}"; filename="${value.name}"\r\n`));
							chunks.push(encoder.encode(`Content-Type: ${value.type || 'application/octet-stream'}\r\n\r\n`));
							chunks.push(new Uint8Array(await value.arrayBuffer()));
							chunks.push(encoder.encode('\r\n'));
						} else {
							// Handle text fields
							chunks.push(encoder.encode(`Content-Disposition: form-data; name="${key}"\r\n\r\n`));
							chunks.push(encoder.encode(String(value)));
							chunks.push(encoder.encode('\r\n'));
						}
					}
				} else {
					throw new Error('FormData.entries is not supported in this environment.');
				}
				
				// Add final boundary
				chunks.push(encoder.encode(`--${boundary}--\r\n`));
				
				// Combine all chunks into a single ArrayBuffer
				const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
				const combined = new Uint8Array(totalLength);
				let offset = 0;
				for (const chunk of chunks) {
					combined.set(chunk, offset);
					offset += chunk.length;
				}
				
				body = combined.buffer;
				headers['Content-Type'] = `multipart/form-data; boundary=${boundary}`;
			} else {
				// For non-FormData requests
				body = options.body as string | ArrayBuffer;
			}
			
			// Convert RequestInit options to RequestUrlParam format
			const requestParams = {
				url: url,
				method: options.method || 'GET',
				headers: headers,
				body: body,
				throw: false // Handle errors manually for consistent behavior
			};

			if (requestParams.body && typeof requestParams.body === 'string') {
				// If body is a string, likely JSON, ensure content type is set
				if (!requestParams.headers['Content-Type'] && !requestParams.headers['content-type']) {
					requestParams.headers['Content-Type'] = 'application/json';
				}
			}

			// Check for user cancellation before making request
			if (options.signal?.aborted) {
				throw new Error('Request cancelled by user');
			}
			
			const response = await requestUrl(requestParams);
			

			if (response.status < 200 || response.status >= 300) {
				const error = await this.parseError(response);
				
				// Check if retryable
				if (this.isRetryable(response.status) && retryCount < this.config.maxRetries!) {
					await this.delay(this.config.retryDelay! * Math.pow(2, retryCount)); // Exponential backoff
					return this.executeWithRetry<T>(url, options, retryCount + 1);
				}

				throw this.createApiError(error);
			}

			// Parse response based on content type
			const contentType = response.headers['content-type'] || response.headers['Content-Type'];
			
			let responseData: T;
			if (contentType?.includes('application/json')) {
				responseData = response.json as T;
			} else {
				responseData = response.text as unknown as T;
			}
			
			return responseData;

		} catch (error) {
			// Handle network errors
			if (error instanceof Error) {
				// Check for user cancellation
				if (options.signal?.aborted) {
					throw new Error('Request cancelled by user');
				}
				throw error;
			}
			throw new Error('Unknown error occurred');
		}
	}

	/**
	 * Parse error response
	 */
	private async parseError(response: { status: number; headers: Record<string, string>; json: any; text: string }): Promise<ApiError> {
		try {
			const data = response.json;
			return {
				status: response.status,
				message: data.error?.message || data.message || `HTTP ${response.status} error`,
				code: data.error?.code || data.code,
				details: data.error || data
			};
		} catch (e) {
			return {
				status: response.status,
				message: response.text || `HTTP ${response.status} error`
			};
		}
	}

	/**
	 * Check if error is retryable
	 */
	private isRetryable(status: number): boolean {
		// Retry on server errors and rate limiting
		return status >= 500 || status === 429 || status === 408;
	}

	/**
	 * Create formatted API error
	 */
	private createApiError(error: ApiError): Error {
		const message = `API Error ${error.status}: ${error.message}`;
		const apiError = new Error(message);
		(apiError as any).status = error.status;
		(apiError as any).code = error.code;
		(apiError as any).details = error.details;
		return apiError;
	}

	/**
	 * Delay helper for retries
	 */
	private delay(ms: number): Promise<void> {
		return new Promise(resolve => setTimeout(resolve, ms));
	}

	/**
	 * Test API connection
	 */
	abstract testConnection(): Promise<boolean>;
}