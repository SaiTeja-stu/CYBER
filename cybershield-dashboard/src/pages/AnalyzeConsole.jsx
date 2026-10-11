import { useState, useRef, useEffect } from 'react';
import {
  SearchCode,
  Play,
  Trash2,
  ShieldAlert,
  CreditCard,
  Sparkles,
  CheckCircle2,
  AlertOctagon,
  Camera,
  QrCode,
  RefreshCw,
  ListChecks,
  Bot,
} from 'lucide-react';
import { api } from '../api.js';
import { RiskBadge, ScoreRing, Card, Spinner } from '../components/ui.jsx';
import SpecularButton from '../components/SpecularButton.jsx';

const TYPES = ['URL', 'EMAIL', 'SMS', 'QR', 'WEBPAGE', 'SOCIAL'];
const TYPE_LABEL = { URL: 'Link', EMAIL: 'Email', SMS: 'SMS', QR: 'QR code', WEBPAGE: 'Web page', SOCIAL: 'Social post' };

const SAMPLES = {
  SMS: 'URGENT: your SBI account is blocked. Verify KYC at http://sbi-netbanking-update.in and share the OTP now',
  QR: 'upi://collect?pa=random123@okhdfcbank&pn=Amazon%20Refund&am=4999&tn=refund',
  URL: 'https://paypa1-verify.com/login',
  EMAIL: 'Dear Customer, Your bank account requires urgent verification. Click http://bank-update-verify.com to log in.',
  WEBPAGE: '<html><head><title>Verify Bank Account</title></head><body><form action="http://phishing-site.xyz/steal"><input name="pass" type="password"/></form></body></html>',
  SOCIAL: 'Hey bro check out this secret crypto giveaway link: http://bit.ly/claim-free-eth-bonus now!!',
};

const SEV_META = {
  CRITICAL: { cls: 'bg-red-500/10 text-red-400 border-red-500/30', label: 'Very serious' },
  HIGH: { cls: 'bg-orange-500/10 text-orange-400 border-orange-500/30', label: 'Serious' },
  MEDIUM: { cls: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30', label: 'Worth a look' },
  LOW: { cls: 'bg-slate-500/10 text-slate-300 border-slate-500/30', label: 'Minor' },
  TRUST: { cls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30', label: 'Good sign' },
};

export default function AnalyzeConsole() {
  const [type, setType] = useState('SMS');
  const [content, setContent] = useState(SAMPLES.SMS);
  const [res, setRes] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  // Camera Scanner state
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  useEffect(() => {
    return () => {
      // Clean up camera stream on unmount
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  async function startCamera() {
    setCameraError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setIsCameraActive(true);
    } catch {
      setCameraError("We couldn't open your camera. Check that this browser is allowed to use it.");
    }
  }

  function stopCamera() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setIsCameraActive(false);
  }

  async function run() {
    if (!content.trim()) return;
    setBusy(true);
    setErr('');
    setRes(null);
    try {
      setRes(await api.analyze({ type, content, source: 'dashboard' }));
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
          <SearchCode className="h-6 w-6 text-cyber-accent" /> Check something
        </h1>
        <p className="mt-1 text-sm text-slate-400">
          Paste a link, message, email, QR code text or web page and we'll tell you how risky it is, and why.
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-12">
        {/* Left Column: Input & Camera Scanner Controls */}
        <div className="space-y-5 lg:col-span-5">
          <div className="glass-card rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-slate-300">What are you checking?</span>
              <button
                onClick={() => setContent('')}
                className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-red-400 transition-colors"
              >
                <Trash2 className="h-3 w-3" /> Clear
              </button>
            </div>

            {/* Type selector tabs */}
            <div className="grid grid-cols-3 gap-1.5 rounded-xl border border-cyber-border bg-cyber-dark/80 p-1.5">
              {TYPES.map((t) => (
                <button
                  key={t}
                  onClick={() => {
                    setType(t);
                    if (SAMPLES[t]) setContent(SAMPLES[t]);
                    if (t !== 'QR' && isCameraActive) stopCamera();
                  }}
                  className={`rounded-lg px-2 py-1.5 text-xs font-semibold transition-all ${
                    type === t
                      ? 'bg-cyber-accent/20 text-cyber-accent border border-cyber-accent/40 shadow-cyber-glow'
                      : 'text-slate-400 hover:bg-cyber-border/40 hover:text-slate-200'
                  }`}
                >
                  {TYPE_LABEL[t]}
                </button>
              ))}
            </div>

            {/* ANIMATED CAMERA SCANNER VIEWPORT FOR QR SCANNING */}
            {type === 'QR' && (
              <div className="space-y-3 pt-1">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-cyber-accent flex items-center gap-1.5">
                    <Camera className="h-3.5 w-3.5" /> Scan with your camera
                  </span>
                  <button
                    onClick={isCameraActive ? stopCamera : startCamera}
                    className="flex items-center gap-1.5 rounded-lg border border-cyber-accent/40 bg-cyber-accent/10 px-2.5 py-1 text-[11px] font-bold text-cyber-accent hover:bg-cyber-accent/20 transition-all"
                  >
                    <RefreshCw className="h-3 w-3" />
                    <span>{isCameraActive ? 'Turn camera off' : 'Turn camera on'}</span>
                  </button>
                </div>

                {/* Futuristic Camera Scanner Viewport */}
                <div className="relative h-56 w-full overflow-hidden rounded-2xl border-2 border-cyber-accent/40 bg-slate-950/90 shadow-2xl flex items-center justify-center">
                  {/* Live WebCam Video or Simulated Grid Canvas */}
                  {isCameraActive ? (
                    <video ref={videoRef} autoPlay playsInline muted className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex flex-col items-center justify-center space-y-2 text-center p-4">
                      <QrCode className="h-12 w-12 text-cyber-accent/40 animate-cyber-pulse" />
                      <div className="text-sm text-slate-300 font-semibold">Camera is off</div>
                      <div className="text-[10px] text-slate-500">
                        Turn the camera on and hold a QR code inside the frame, or paste its text below
                      </div>
                    </div>
                  )}

                  {/* 4 Neon Corner Brackets */}
                  <div className="absolute left-3 top-3 h-6 w-6 border-l-2 border-t-2 border-cyber-accent rounded-tl-md animate-corner-glow" />
                  <div className="absolute right-3 top-3 h-6 w-6 border-r-2 border-t-2 border-cyber-accent rounded-tr-md animate-corner-glow" />
                  <div className="absolute bottom-3 left-3 h-6 w-6 border-l-2 border-b-2 border-cyber-accent rounded-bl-md animate-corner-glow" />
                  <div className="absolute bottom-3 right-3 h-6 w-6 border-r-2 border-b-2 border-cyber-accent rounded-br-md animate-corner-glow" />

                  {/* Animated Sweeping Laser Line */}
                  <div className="absolute inset-x-4 h-1 bg-gradient-to-r from-transparent via-cyber-accent to-transparent shadow-cyber-glow animate-scan-laser pointer-events-none" />

                  {/* Center Crosshair Target Overlay */}
                  <div className="absolute h-10 w-10 rounded-full border border-cyan-400/40 pointer-events-none flex items-center justify-center">
                    <div className="h-2 w-2 rounded-full bg-cyan-400/80 animate-cyber-pulse" />
                  </div>

                  {/* Scanning Status Badge Overlay */}
                  <div className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full border border-cyan-500/40 bg-slate-950/80 px-3 py-0.5 text-[11px] font-semibold text-cyan-300 backdrop-blur-md flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-cyber-pulse" />
                    <span>{isCameraActive ? 'Looking for a QR code…' : 'Ready'}</span>
                  </div>
                </div>

                {cameraError && (
                  <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-2.5 text-[11px] text-amber-300">
                    {cameraError}
                  </div>
                )}
              </div>
            )}

            {/* Content Textarea */}
            <div>
              <div className="mb-2 flex items-center justify-between text-xs text-slate-400">
                <span>Paste it here</span>
                <span>{content.length} characters</span>
              </div>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={type === 'QR' ? 5 : 9}
                className="w-full rounded-xl border border-cyber-border bg-cyber-dark p-3.5 font-mono text-sm text-slate-200 placeholder-slate-600 outline-none focus:border-cyber-accent focus:ring-1 focus:ring-cyber-accent"
                placeholder="Paste a link, a message, an email, QR code text or a web page…"
              />
            </div>

            {/* Run Button */}
            <SpecularButton
              onClick={run}
              disabled={busy || !content.trim()}
              size="lg"
              lineColor="#63e31a"
              baseColor="#1c5a12"
              radius={14}
              className="w-full font-bold shadow-cyber-glow"
            >
              {busy ? <Spinner className="h-4 w-4 text-cyan-400" /> : <Play className="h-4 w-4 fill-cyan-400 text-cyan-400" />}
              <span>{busy ? 'Checking…' : 'Check it'}</span>
            </SpecularButton>

            {err && (
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-400 flex items-center gap-2">
                <AlertOctagon className="h-4 w-4 shrink-0" />
                <span>{err}</span>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Detailed Verdict Output */}
        <div className="lg:col-span-7 space-y-5">
          {!res && (
            <div className="flex h-96 flex-col items-center justify-center gap-3 rounded-2xl border border-cyber-border bg-cyber-panel/40 p-8 text-center text-slate-500">
              <Sparkles className="h-10 w-10 text-cyber-accent/40 animate-cyber-pulse" />
              <h3 className="text-base font-bold text-slate-300">Your result will appear here</h3>
              <p className="max-w-md text-xs">
                Pick what you're checking, paste it on the left (we've filled in an example) and press Check it. You'll see how risky it is, the warning signs we found, and what to do next.
              </p>
            </div>
          )}

          {res && (
            <div className="space-y-5">
              {/* Verdict Overview Hero Banner */}
              <div className={`glass-card rounded-2xl p-6 border-l-4 ${
                (res.verdict === 'UNSAFE' || res.riskLevel === 'MALICIOUS')
                  ? 'border-l-red-500 bg-red-950/20'
                  : res.verdict === 'FRAUD'
                  ? 'border-l-purple-500 bg-purple-950/20'
                  : (res.verdict === 'SUSPICIOUS' || res.riskLevel === 'SUSPICIOUS')
                  ? 'border-l-amber-500 bg-amber-950/20'
                  : res.verdict === 'UNVERIFIED'
                  ? 'border-l-slate-400 bg-slate-900/40'
                  : 'border-l-emerald-500 bg-emerald-950/20'
              }`}>
                <div className="flex flex-col sm:flex-row items-center gap-6">
                  <ScoreRing score={res.riskScore} size="lg" />
                  <div className="space-y-2 text-center sm:text-left flex-1">
                    <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2.5">
                      {res.verdict === 'UNSAFE' && (
                        <span className="rounded-lg bg-red-500/20 border border-red-500/50 px-3 py-1 text-xs font-bold text-red-400">
                          UNSAFE · Confirmed threat
                        </span>
                      )}
                      {res.verdict === 'FRAUD' && (
                        <span className="rounded-lg bg-purple-500/20 border border-purple-500/50 px-3 py-1 text-xs font-bold text-purple-300">
                          FRAUD · Credible scam / lookalike
                        </span>
                      )}
                      {res.verdict === 'SUSPICIOUS' && (
                        <span className="rounded-lg bg-amber-500/20 border border-amber-500/50 px-3 py-1 text-xs font-bold text-amber-300">
                          SUSPICIOUS · Caution advised
                        </span>
                      )}
                      {res.verdict === 'UNVERIFIED' && (
                        <span className="rounded-lg bg-slate-500/20 border border-slate-500/50 px-3 py-1 text-xs font-bold text-slate-300">
                          UNVERIFIED · Incomplete lookups
                        </span>
                      )}
                      {res.verdict === 'NO_KNOWN_THREATS' && (
                        <span className="rounded-lg bg-emerald-500/20 border border-emerald-500/50 px-3 py-1 text-xs font-bold text-emerald-400">
                          NO KNOWN THREATS DETECTED
                        </span>
                      )}
                      <span className="text-sm font-medium text-slate-300">
                        "{res.wording || (res.verdict === 'NO_KNOWN_THREATS' ? 'All checks clean' : 'Evaluation complete')}"
                      </span>
                    </div>

                    {res.verdict === 'NO_KNOWN_THREATS' && (
                      <p className="text-xs text-emerald-400/90 font-medium">
                        * Note: This means existing checks found no known threats; this is not an absolute guarantee of safety.
                      </p>
                    )}

                    {/* Host & Domain Evidence Bar */}
                    {(res.checkedHostname || res.registrableDomain) && (
                      <div className="rounded-xl border border-cyber-border bg-cyber-dark/80 p-2.5 text-xs text-slate-300 space-y-1 font-mono">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-slate-500">Host:</span>
                          <span className="text-cyan-300 font-semibold">{res.checkedHostname || '—'}</span>
                          <span className="text-slate-600">|</span>
                          <span className="text-slate-500">Domain:</span>
                          <span className="text-white font-semibold">{res.registrableDomain || '—'}</span>
                        </div>
                        {res.finalDestination && res.finalDestination !== res.checkedHostname && (
                          <div className="flex items-center gap-1.5 text-slate-400">
                            <span>Redirects to:</span>
                            <span className="text-amber-300">{res.finalDestination}</span>
                          </div>
                        )}
                      </div>
                    )}

                    <div className="flex flex-wrap items-center justify-center sm:justify-start gap-4 text-xs text-slate-400 pt-1">
                      <span>Sender: <strong className={res.verified ? 'text-emerald-400' : 'text-slate-300'}>{res.verified ? 'Verified official' : 'Unverified'}</strong></span>
                      <span>Allowlist: <strong className={res.trusted ? 'text-emerald-400' : 'text-slate-300'}>{res.trusted ? 'Recognized official brand' : 'Not on allowlist'}</strong></span>
                    </div>
                  </div>
                </div>

                {/* 4 Findings Dimensions */}
                {res.findings && (
                  <div className="mt-5 pt-4 border-t border-cyber-border/60 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                    <div className="rounded-xl border border-cyber-border/70 bg-cyber-dark/40 p-3">
                      <div className="flex items-center justify-between pb-1">
                        <span className="font-semibold text-slate-300">Technical Threat</span>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          res.findings.technicalThreat?.status === 'MALICIOUS' ? 'bg-red-500/20 text-red-400' :
                          res.findings.technicalThreat?.status === 'SUSPICIOUS' ? 'bg-amber-500/20 text-amber-400' :
                          'bg-emerald-500/20 text-emerald-400'
                        }`}>
                          {res.findings.technicalThreat?.status || 'CLEAN'}
                        </span>
                      </div>
                      <p className="text-slate-400 leading-relaxed">{res.findings.technicalThreat?.details}</p>
                    </div>

                    <div className="rounded-xl border border-cyber-border/70 bg-cyber-dark/40 p-3">
                      <div className="flex items-center justify-between pb-1">
                        <span className="font-semibold text-slate-300">Brand Authenticity</span>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          res.findings.brandAuthenticity?.status === 'OFFICIAL' ? 'bg-emerald-500/20 text-emerald-400' :
                          res.findings.brandAuthenticity?.status === 'DECEPTIVE_SUBDOMAIN' || res.findings.brandAuthenticity?.status === 'LOOKALIKE' ? 'bg-red-500/20 text-red-400' :
                          'bg-slate-500/20 text-slate-300'
                        }`}>
                          {res.findings.brandAuthenticity?.status || 'NEUTRAL'}
                        </span>
                      </div>
                      <p className="text-slate-400 leading-relaxed">{res.findings.brandAuthenticity?.details}</p>
                    </div>

                    <div className="rounded-xl border border-cyber-border/70 bg-cyber-dark/40 p-3">
                      <div className="flex items-center justify-between pb-1">
                        <span className="font-semibold text-slate-300">Scam Evidence</span>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          res.findings.scamEvidence?.status === 'CREDENTIAL_HARVESTING' || res.findings.scamEvidence?.status === 'COERCION_URGENCY' ? 'bg-red-500/20 text-red-400' :
                          'bg-emerald-500/20 text-emerald-400'
                        }`}>
                          {res.findings.scamEvidence?.status || 'NONE'}
                        </span>
                      </div>
                      <p className="text-slate-400 leading-relaxed">{res.findings.scamEvidence?.details}</p>
                    </div>

                    <div className="rounded-xl border border-cyber-border/70 bg-cyber-dark/40 p-3">
                      <div className="flex items-center justify-between pb-1">
                        <span className="font-semibold text-slate-300">Content Advisory</span>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          res.findings.contentAdvisory?.status === 'STREAMING_PIRACY' ? 'bg-blue-500/20 text-blue-300' :
                          'bg-slate-500/20 text-slate-300'
                        }`}>
                          {res.findings.contentAdvisory?.status || 'CLEAN'}
                        </span>
                      </div>
                      <p className="text-slate-400 leading-relaxed">{res.findings.contentAdvisory?.details}</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Payment Details Card */}
              {res.payment && (
                <Card title="Payment details" icon={CreditCard}>
                  <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs">
                    <div>
                      <dt className="text-slate-500">Type</dt>
                      <dd className="font-semibold text-slate-200">{res.payment.scheme} · {res.payment.action}</dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">Money goes to</dt>
                      <dd className="font-semibold text-slate-200 truncate">{res.payment.payeeName || '—'}</dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">UPI ID</dt>
                      <dd className="font-mono text-cyan-300 truncate">{res.payment.payeeVpa}</dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">Amount</dt>
                      <dd className="font-bold text-amber-400">{res.payment.amount ?? '—'} {res.payment.currency}</dd>
                    </div>
                  </dl>
                  {res.payment.pullPayment && (
                    <div className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-2.5 text-xs text-amber-300 font-semibold flex items-center gap-2">
                      <AlertOctagon className="h-4 w-4 shrink-0" />
                      <span>Careful: this takes money out of the account. A classic "scan to receive money" scam.</span>
                    </div>
                  )}
                </Card>
              )}

              {/* Detected Policy Signals */}
              <Card title={`Warning signs we found (${res.signals.length})`} icon={ShieldAlert}>
                <div className="space-y-2.5 pt-1">
                  {res.signals.map((s, i) => {
                    const sev = SEV_META[s.severity] || SEV_META.LOW;
                    return (
                      <div key={i} className="rounded-xl border border-cyber-border/70 bg-cyber-dark/60 p-3.5 text-sm space-y-1">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            
                            <span className={`rounded-md border px-2 py-0.5 text-[10px] font-bold ${sev.cls}`}>
                              {sev.label}
                            </span>
                          </div>
                          <span className="font-mono font-bold text-slate-300">
                            {s.weight > 0 ? '+' : ''}{s.weight} risk
                          </span>
                        </div>
                        <div className="font-bold text-slate-200">{s.name}</div>
                        <div className="text-slate-400 leading-relaxed">{s.detail}</div>
                      </div>
                    );
                  })}
                </div>
              </Card>

              {/* Engine Explanation */}
              <Card title="In plain words" icon={Sparkles}>
                <p className="text-sm text-slate-300 leading-relaxed">{res.explanation}</p>
              </Card>

              {/* Safe Browsing Recommendations */}
              <Card title="What to do" icon={CheckCircle2}>
                <ul className="space-y-2 text-sm text-slate-300">
                  {res.recommendations.map((r, i) => (
                    <li key={i} className="flex items-start gap-2.5">
                      <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-cyber-accent" />
                      <span>{r}</span>
                    </li>
                  ))}
                </ul>
              </Card>

              {/* Inspection Audit: Checks Run vs Unavailable */}
              {((res.checksRun && res.checksRun.length > 0) || (res.checksFailed && res.checksFailed.length > 0)) && (
                <Card title="Check sources & audit" icon={ListChecks}>
                  <div className="space-y-3 text-xs">
                    {res.checksRun && res.checksRun.length > 0 && (
                      <div className="space-y-1.5">
                        <span className="font-semibold text-emerald-400">Completed checks ({res.checksRun.length})</span>
                        <ul className="space-y-1">
                          {res.checksRun.map((c, i) => (
                            <li key={i} className="flex items-center gap-2 text-slate-300">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shrink-0" />
                              <span>{c}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {res.checksFailed && res.checksFailed.length > 0 && (
                      <div className="space-y-1.5 pt-2 border-t border-cyber-border/40">
                        <span className="font-semibold text-amber-400">Failed / unavailable lookups ({res.checksFailed.length})</span>
                        <ul className="space-y-1">
                          {res.checksFailed.map((c, i) => (
                            <li key={i} className="flex items-center gap-2 text-slate-400">
                              <span className="h-1.5 w-1.5 rounded-full bg-amber-400 shrink-0" />
                              <span>{c}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </Card>
              )}

              {/* AI Assisted Analysis (Honest Telemetry) */}
              {res.aiAnalysis && (
                <Card title="AI evaluation status" icon={Bot}>
                  <div className="space-y-2 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="text-slate-400">Provider:</span>
                      <span className="font-mono text-cyan-300">{res.aiAnalysis.provider || 'None'}</span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${res.aiAnalysis.configured ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-500/20 text-slate-300'}`}>
                        {res.aiAnalysis.configured ? 'Active' : 'Not configured'}
                      </span>
                    </div>
                    <p className="text-slate-300 leading-relaxed">{res.aiAnalysis.explanation}</p>
                  </div>
                </Card>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
