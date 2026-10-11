// Types for SecureMe / CyberShield browser extension

export type RiskLevel = 'SAFE' | 'SUSPICIOUS' | 'HIGH_RISK' | 'MALICIOUS';

/**
 * 4 clear, evidence-based verdicts required by CyberShield:
 * - UNSAFE: Strong, specific evidence indicates a technical threat (verified phishing, malware, hostile redirect).
 * - FRAUD: Credible evidence supports a scam or impersonation attempt. Not based solely on brand resemblance.
 * - UNVERIFIED: Insufficient reliable evidence, required check failed, or backend unreachable.
 * - SAFE_SIGNALS_FOUND: Checks found no known threat and verified official signals where possible. Caveat: does not guarantee safety.
 */
export type ExtensionVerdict = 'UNSAFE' | 'FRAUD' | 'SUSPICIOUS' | 'UNVERIFIED' | 'NO_KNOWN_THREATS' | 'SAFE_SIGNALS_FOUND';

export type ServerStatus = 'CONNECTED' | 'NOT_SIGNED_IN' | 'UNAVAILABLE' | 'TIMED_OUT';

export interface FindingsBreakdown {
  technicalThreat: {
    status: 'CLEAN' | 'SUSPICIOUS' | 'MALICIOUS';
    details: string;
    evidence: string[];
  };
  brandAuthenticity: {
    status: 'OFFICIAL' | 'LOOKALIKE' | 'DECEPTIVE_SUBDOMAIN' | 'UNVERIFIED_CLAIM' | 'UNRELATED' | 'NOT_APPLICABLE';
    details: string;
    brand?: string;
    officialDomain?: string;
  };
  scamEvidence: {
    status: 'NONE' | 'CREDENTIAL_HARVESTING' | 'COERCION_URGENCY' | 'FINANCIAL_SCAM';
    details: string;
    hits: string[];
  };
  contentAdvisory: {
    status: 'CLEAN' | 'STREAMING_PIRACY' | 'GAMBLING' | 'CRACK_WAREZ';
    details: string;
  };
}

export interface ExecutionMetadata {
  checksRun: string[];
  checksFailed: string[];
  serverStatus: ServerStatus;
  serverChecked: boolean;
  serverTimestamp?: string;
  serverSource?: string;
  analyzedAt: string;
  source: 'browser' | 'cloud' | 'hybrid';
}

export interface Signal {
  policyId: string;
  name: string;
  detail: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'TRUST';
  weight: number;
}

export interface PaymentInfo {
  scheme: string;
  action: string;
  payeeVpa: string | null;
  payeeName: string | null;
  amount: number | null;
  currency: string | null;
  note: string | null;
  pullPayment: boolean;
}

export interface AnalyzeResponse {
  reportId: string;
  contentType: string;
  verdict: ExtensionVerdict;
  verdictTitle: string;
  verdictReason: string;
  riskScore: number;
  riskLevel: RiskLevel;
  priority: string;
  wording: string;
  verified: boolean;
  trusted: boolean;
  initiatesPayment: boolean;
  categories: string[];
  signals: Signal[];
  explanation: string;
  recommendations: string[];
  payment: PaymentInfo | null;
  analyzedAt: string;
  findings: FindingsBreakdown;
  execution: ExecutionMetadata;
}

export type ContentType = 'URL' | 'EMAIL' | 'SMS' | 'QR' | 'WEBPAGE' | 'SOCIAL';

export interface AnalyzeRequest {
  type: ContentType;
  content: string;
  pageUrl?: string;
  source?: string;
}

// content-script <-> popup/background messages
export type CsMessage =
  | { kind: 'GET_PAGE_CONTEXT' }
  | { kind: 'GET_SELECTION' };

/** content script -> background */
export type BgMessage =
  | { kind: 'PAGE_LOADED'; ctx: PageContext }
  | { kind: 'CHECK_HOST_ALLOWED'; hostname: string }
  | { kind: 'SET_HOST_ALLOWED'; hostname: string }
  | { kind: 'HAS_OVERRIDE' }
  | { kind: 'SET_OVERRIDE'; password: string }
  | { kind: 'VERIFY_OVERRIDE'; password: string };

export interface PageVerdict {
  verdict: ExtensionVerdict;
  level: RiskLevel;
  score: number;
  reasons: string[];
}

export interface PageContext {
  url: string;
  title: string;
  html: string;        // capped
  selection: string;
  linkCount: number;
}
