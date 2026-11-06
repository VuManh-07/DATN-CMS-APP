/**
 * Typing for the `window.cms` surface exposed by process/electron/preload.ts.
 * Keep the two in step — this file is what the pages are checked against.
 */

export type Unsubscribe = () => void;

export interface ReaderState {
  available: boolean;
  deviceName: string | null;
  cardPresent: boolean;
  atr: string | null;
}

export interface ApduTraceEntry {
  direction: "command" | "response" | "info" | "error";
  text: string;
  at: number;
}

export interface PersonalizeProgress {
  stepIndex: number;
  totalSteps: number;
  step: { key: string; label: string; ins: string };
  phase: "start" | "done" | "failed";
  sw?: string;
  error?: string;
}

export interface CurrentUser {
  username: string;
  fullName: string;
  role: "SUPER_ADMIN" | "ADMIN" | "OPERATOR" | "AUDITOR";
}

export interface CmsBridge {
  auth: {
    login(username: string, password: string): Promise<CurrentUser>;
    logout(): Promise<void>;
    currentUser(): Promise<CurrentUser | null>;
  };
  reader: {
    state(): Promise<ReaderState>;
    onStateChanged(cb: (s: ReaderState) => void): Unsubscribe;
    onCardInserted(cb: (p: { atr: string }) => void): Unsubscribe;
    onCardRemoved(cb: (p: unknown) => void): Unsubscribe;
  };
  card: {
    readCsn(): Promise<string>;
    openSession(cardId: string): Promise<{ entityId: string; aid: string; kvn: number }>;
    closeSession(result?: "SUCCESS" | "ABANDONED"): Promise<void>;
    sessionState(): Promise<{ open: boolean; entityId: string | null; cardId: string | null }>;
    personalize(
      cardId: string,
      options?: { cardCode?: string; initialPin?: string; generateSeed?: boolean }
    ): Promise<{
      success: boolean;
      error?: string;
      stepResults: Array<{ key: string; ok: boolean; sw?: string; error?: string }>;
      card: any;
      plan: any;
    }>;
    sendCommand(
      ins: string,
      data?: string,
      p1?: string,
      p2?: string
    ): Promise<{ data: string; sw?: string }>;
    onTrace(cb: (entry: ApduTraceEntry) => void): Unsubscribe;
    onProgress(cb: (p: PersonalizeProgress) => void): Unsubscribe;
  };
  api: {
    get<T = any>(path: string, params?: Record<string, any>): Promise<T>;
    post<T = any>(path: string, body?: any): Promise<T>;
    patch<T = any>(path: string, body?: any): Promise<T>;
    del<T = any>(path: string): Promise<T>;
  };
}

declare global {
  interface Window {
    cms: CmsBridge;
  }
}
