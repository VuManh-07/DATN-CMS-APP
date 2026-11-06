"use strict";

import axios, { AxiosInstance } from "axios";

/**
 * HTTP client for cms-server, living in the Electron main process.
 *
 * The access token is held here and never handed to the renderer, so a
 * compromised page cannot exfiltrate it. The renderer calls IPC methods and
 * gets back plain data.
 */

const DEFAULT_BASE_URL =
  process.env.CMS_API_BASE_URL || "http://localhost:1255/api/v1";

export interface LoginResult {
  username: string;
  fullName: string;
  role: string;
}

class ApiClient {
  private http: AxiosInstance;
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private currentUser: LoginResult | null = null;

  constructor(baseURL: string = DEFAULT_BASE_URL) {
    this.http = axios.create({ baseURL, timeout: 20_000 });

    this.http.interceptors.request.use((cfg) => {
      if (this.accessToken) {
        cfg.headers.Authorization = `Bearer ${this.accessToken}`;
      }
      return cfg;
    });

    // One transparent retry after refreshing an expired access token.
    this.http.interceptors.response.use(
      (r) => r,
      async (error) => {
        const original = error.config || {};
        const status = error.response?.status;

        if (status === 401 && this.refreshToken && !original.__isRetry) {
          try {
            const { data } = await axios.post(`${baseURL}/auth/refresh`, {
              refreshToken: this.refreshToken,
            });
            this.accessToken = data.metadata.accessToken;
            this.refreshToken = data.metadata.refreshToken;
            original.__isRetry = true;
            original.headers = {
              ...original.headers,
              Authorization: `Bearer ${this.accessToken}`,
            };
            return this.http.request(original);
          } catch {
            this.clearSession();
          }
        }
        throw this.normalizeError(error);
      }
    );
  }

  /** Turn an axios failure into a plain Error that survives IPC. */
  private normalizeError(error: any): Error {
    const serverMessage = error.response?.data?.message;
    if (serverMessage) return new Error(serverMessage);
    if (error.code === "ECONNREFUSED") {
      return new Error(
        "Cannot reach cms-server. Is it running on " +
          (process.env.CMS_API_BASE_URL || "http://localhost:1255") +
          "?"
      );
    }
    return new Error(error.message || "Request failed");
  }

  private clearSession() {
    this.accessToken = null;
    this.refreshToken = null;
    this.currentUser = null;
  }

  // --- auth ---

  async login(username: string, password: string): Promise<LoginResult> {
    const { data } = await axios.post(`${this.http.defaults.baseURL}/auth/login`, {
      username,
      password,
    });
    const { tokens, admin } = data.metadata;
    this.accessToken = tokens.accessToken;
    this.refreshToken = tokens.refreshToken;
    this.currentUser = {
      username: admin.username,
      fullName: admin.fullName,
      role: admin.role,
    };
    return this.currentUser;
  }

  async logout() {
    try {
      if (this.accessToken) await this.http.post("/auth/logout");
    } finally {
      this.clearSession();
    }
  }

  getCurrentUser() {
    return this.currentUser;
  }

  isAuthenticated() {
    return !!this.accessToken;
  }

  // --- generic verbs, used by the IPC layer ---

  async get<T = any>(path: string, params?: any): Promise<T> {
    const { data } = await this.http.get(path, { params });
    return data.metadata;
  }

  async post<T = any>(path: string, body?: any): Promise<T> {
    const { data } = await this.http.post(path, body);
    return data.metadata;
  }

  async del<T = any>(path: string): Promise<T> {
    const { data } = await this.http.delete(path);
    return data.metadata;
  }

  async patch<T = any>(path: string, body?: any): Promise<T> {
    const { data } = await this.http.patch(path, body);
    return data.metadata;
  }
}

export const apiClient = new ApiClient();
export default ApiClient;
