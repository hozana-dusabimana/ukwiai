import React, { useState, useRef, useEffect } from "react";
import { Camera, CloudUpload, ArrowRight, Clock, CheckCircle2, AlertTriangle, ShieldCheck, VideoOff, RefreshCw, Trash2 } from "lucide-react";
import { ScanHistory, OverviewData } from "../types";
import { api } from "../lib/api";
import { useToast } from "../ui/Toast";
import { useAuth } from "../auth/AuthContext";
import { capabilitiesFor } from "../lib/roles";

interface AnalysisWorkspaceProps {
  scans: ScanHistory[];
  overview: OverviewData | null;
  onAnalysisResult: (newScan: ScanHistory) => void;
  onSelectScan: (scan: ScanHistory) => void;
  onDeleteScan?: (scan: ScanHistory) => Promise<void>;
  onSelectProject?: (id: number) => void;
}

export default function AnalysisWorkspace({
  scans,
  overview,
  onAnalysisResult,
  onSelectScan,
  onDeleteScan,
  onSelectProject,
}: AnalysisWorkspaceProps) {
  const toast = useToast();
  const { user } = useAuth();
  const caps = capabilitiesFor(user?.role);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const deleteScan = async (scan: ScanHistory, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!onDeleteScan) return;
    if (!confirm(`Delete "${scan.title}"? This removes the capture and its analysis. This cannot be undone.`)) return;
    setDeletingId(scan.id);
    try {
      await onDeleteScan(scan);
      toast.success("Analysis deleted.");
    } catch (err: any) {
      toast.error(err?.message || "Could not delete analysis.");
    } finally {
      setDeletingId(null);
    }
  };
  const latestScan = scans[0];
  const projectName = overview?.activeProject?.name || "UKWI Project";
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(overview?.activeProject?.id || null);

  // Keep the "attach scan to" target in sync with the global project switcher
  // (the header). Switching the project anywhere updates this selector too.
  useEffect(() => {
    if (overview?.activeProject?.id && overview.activeProject.id !== selectedProjectId) {
      setSelectedProjectId(overview.activeProject.id);
    }
  }, [overview?.activeProject?.id]);

  const [running, setRunning] = useState(false);
  const [displayProgress, setDisplayProgress] = useState(latestScan?.progress ?? 0);
  const [appState, setAppState] = useState<'READY FOR INPUT' | 'PROCESSING AI MODELS...' | 'ANALYSIS COMPLETE'>(
    latestScan ? 'ANALYSIS COMPLETE' : 'READY FOR INPUT'
  );

  const [activeStage, setActiveStage] = useState<string>(latestScan?.stageName || "Awaiting first scan");
  const [activeBudget, setActiveBudget] = useState<{ consumed: string; remaining: string; variance: string; estimated: boolean }>({
    consumed: latestScan?.budgetConsumed || "RWF 0",
    remaining: latestScan?.remainingBudget || overview?.totals?.remainingBudget || "RWF 0",
    variance: latestScan?.projectedVariance || "Pending...",
    estimated: !!latestScan,
  });

  // Re-fetch project-specific data whenever the selected project changes.
  // Uses the real AI analysis history (predicted_stage) + budget summary,
  // not the global scans[0] which is just the most-recently-uploaded image.
  useEffect(() => {
    if (selectedProjectId == null || running) return;
    let cancelled = false;

    (async () => {
      try {
        const [history, summary] = await Promise.all([
          api<Array<{ predicted_stage?: string; predicted_progress_percentage: number | string; confidence_score: number | string }>>(
            `/api/ai/projects/${selectedProjectId}/analysis-history?limit=1`
          ).catch(() => []),
          api<{ project: { total_budget: number | string }; total_expenses: number | string; effective_total_spent?: number | string }>(
            `/api/projects/${selectedProjectId}/summary`
          ).catch(() => null),
        ]);
        if (cancelled) return;

        const latest = history[0];
        if (latest) {
          animateProgressTo(Math.round(Number(latest.predicted_progress_percentage) || 0));
          setActiveStage(latest.predicted_stage || "Stage unknown");
          setAppState('ANALYSIS COMPLETE');
        } else {
          animateProgressTo(0);
          setActiveStage("No scans yet for this project");
          setAppState('READY FOR INPUT');
        }

        if (summary) {
          const totalBudget = Number(summary.project.total_budget) || 0;
          // Effective spend = recorded expenses, or the AI-inferred spend when
          // nothing has been logged yet, so the tile isn't stuck at RWF 0.
          const recorded = Number(summary.total_expenses) || 0;
          const totalSpent = Number(summary.effective_total_spent ?? summary.total_expenses) || 0;
          const remaining = totalBudget - totalSpent;
          const overBudget = remaining < 0;
          setActiveBudget({
            consumed: fmtBudget(totalSpent),
            remaining: fmtBudget(Math.max(0, remaining)),
            variance: overBudget ? `Over by ${fmtBudget(Math.abs(remaining))}` : `${fmtBudget(remaining)} remaining`,
            estimated: totalSpent > recorded,
          });
        }
      } catch (err) {
        console.warn("Failed to load project-specific data:", err);
      }
    })();

    return () => { cancelled = true; };
  }, [selectedProjectId]);

  // Image staged for analysis, awaiting explicit user confirmation. Both the
  // webcam capture and the local-upload paths funnel through this so analysis
  // never starts until the user reviews the preview and clicks "Confirm".
  const [pendingUpload, setPendingUpload] = useState<{ dataUrl: string; name: string; gps: { lat: number; lng: number } | null; source: "camera" | "upload" } | null>(null);
  const [locating, setLocating] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const progressAnimRef = useRef<number | null>(null);

  // Smooth animation from current display value to a target value
  const animateProgressTo = (target: number) => {
    if (progressAnimRef.current) {
      clearInterval(progressAnimRef.current);
      progressAnimRef.current = null;
    }
    const start = displayProgress;
    const delta = target - start;
    if (delta === 0) return;
    const steps = 30;
    let i = 0;
    progressAnimRef.current = window.setInterval(() => {
      i += 1;
      const next = Math.round(start + (delta * i) / steps);
      setDisplayProgress(next);
      if (i >= steps) {
        if (progressAnimRef.current) clearInterval(progressAnimRef.current);
        progressAnimRef.current = null;
        setDisplayProgress(target);
      }
    }, 16);
  };

  useEffect(() => {
    return () => {
      if (progressAnimRef.current) clearInterval(progressAnimRef.current);
    };
  }, []);

  // -------------- Real webcam capture --------------
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const startCamera = async () => {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraOn(true);
    } catch (err: any) {
      setCameraError(err?.message || "Camera unavailable. Check browser permissions.");
    }
  };

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraOn(false);
  };

  useEffect(() => {
    return () => stopCamera();
  }, []);

  // Best-effort device GPS. Resolves to null (never rejects) so a capture is
  // never blocked client-side — the backend geofence guard is authoritative and
  // returns a friendly 422 when a geofenced project needs a location it lacks.
  const getDeviceLocation = (): Promise<{ lat: number; lng: number } | null> =>
    new Promise((resolve) => {
      if (!("geolocation" in navigator)) return resolve(null);
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => resolve(null),
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
      );
    });

  const captureAndAnalyze = async () => {
    const video = videoRef.current;
    if (!video || !streamRef.current) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
    // Never stage anything that isn't an image (e.g. a tainted-canvas result).
    if (!dataUrl.startsWith("data:image/")) {
      toast.error("Camera capture failed — please try again.");
      return;
    }
    // Read the device location at the moment of capture so it reflects where the
    // photo was actually taken.
    setLocating(true);
    const gps = await getDeviceLocation();
    setLocating(false);
    const stamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-");
    // Stage the captured frame and let the user confirm before we analyse it.
    setPendingUpload({ dataUrl, name: `webcam-${stamp}`, gps, source: "camera" });
  };

  // Run analysis on the staged image once the user confirms.
  const confirmAnalysis = () => {
    if (!pendingUpload) return;
    const { dataUrl, name, gps, source } = pendingUpload;
    setPendingUpload(null);
    triggerAnalysis(dataUrl, name, gps, source);
  };

  const cancelAnalysis = () => setPendingUpload(null);

  // Handle API post trigger
  const triggerAnalysis = async (base64Image: string, customName?: string, gps?: { lat: number; lng: number } | null, source: "camera" | "upload" = "camera") => {
    try {
      setAppState('PROCESSING AI MODELS...');
      setRunning(true);
      setActiveStage("Scanning visual elements...");

      const response = await api<Response>("/api/analyze", {
        method: "POST",
        raw: true,
        body: {
          image: base64Image,
          name: customName || "Site Scan Audit",
          projectId: selectedProjectId,
          lat: gps?.lat,
          lng: gps?.lng,
          // Presentation-only upload path is exempt from the on-site geofence
          // (an uploaded photo carries no live capture location). Production
          // uses the camera path, which is geofenced.
          source,
        },
      });

      if (!response.ok) {
        let message = response.statusText;
        try {
          const body = await response.json();
          message = body.error || body.detail || message;
        } catch {
          message = (await response.text().catch(() => "")) || message;
        }
        // 422 = not a basketball court, 409 = stage already completed. These are
        // expected, user-facing outcomes — show the friendly message as an info
        // notice and reset to idle rather than treating it as a hard error.
        if (response.status === 422 || response.status === 409) {
          setRunning(false);
          setAppState('READY FOR INPUT');
          setActiveStage("Ready for input");
          toast.info(message);
          return;
        }
        throw new Error(`Analysis failed: ${message}`);
      }

      const data = await response.json();
      const newScan: ScanHistory = data.scan;

      setRunning(false);
      setAppState('ANALYSIS COMPLETE');
      animateProgressTo(newScan.progress);
      setActiveStage(newScan.stageName);
      setActiveBudget({
        consumed: newScan.budgetConsumed,
        remaining: newScan.remainingBudget,
        variance: newScan.projectedVariance,
        estimated: true,
      });
      toast.success(`AI detected: ${newScan.stageName} (${newScan.progress}%)`);
      // Surface the soft wrong-sport flag (volleyball-sized footprint). The hard
      // case — clear volleyball structures — is rejected upstream (422) and shown
      // via the error path above; this catches the early-phase, measurement-only
      // ambiguity where the photo alone can't tell the two sports apart.
      if (newScan.sportWarning) toast.info(newScan.sportWarning);

      onAnalysisResult(newScan);
    } catch (err: any) {
      console.error(err);
      setRunning(false);
      setAppState('READY FOR INPUT');
      setActiveStage("Analysis failed — try again.");
      toast.error(err?.message || "AI analysis failed");
    }
  };

  // -------------- Local upload (presentation only) --------------
  // Kept for panel demos so a sample court photo can be analysed without being
  // on site. Uploads are flagged source="upload" and skip the geofence; the
  // production flow is the geofenced camera capture above.
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processSelectedFile(file);
    e.target.value = "";
  };

  const processSelectedFile = (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file (JPG, PNG or WEBP).");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result as string;
      setPendingUpload({ dataUrl: base64, name: file.name.replace(/\.[^/.]+$/, ""), gps: null, source: "upload" });
    };
    reader.readAsDataURL(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };
  const handleDragLeave = () => setDragOver(false);
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processSelectedFile(file);
  };

  // Calculation for Circle offset
  const circumference = 2 * Math.PI * 110; // circle r=110, circumference 691.15

  return (
    <div className="space-y-8 select-none">
      {/* Confirm-before-analysis dialog */}
      {pendingUpload && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full overflow-hidden">
            <div className="bg-slate-900 text-white px-6 py-4 flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-orange-500" />
              <span className="font-sans font-bold text-sm uppercase tracking-wider">Confirm AI Analysis</span>
            </div>
            <div className="p-6">
              <div className="rounded border border-gray-200 overflow-hidden bg-gray-50 mb-4">
                <img src={pendingUpload.dataUrl} alt="Image to analyse" className="w-full h-48 object-cover" />
              </div>
              <p className="text-sm text-slate-700 leading-relaxed mb-1">
                Start AI progress analysis on this image?
              </p>
              <p className="text-xs text-gray-500 leading-relaxed mb-6">
                Make sure it's a clear photo of the basketball court site. The AI will reject images
                that aren't a playground or that show a stage already completed.
              </p>
              <div className="flex justify-end gap-3">
                <button
                  onClick={cancelAnalysis}
                  className="px-4 py-2 border border-gray-300 text-slate-700 font-bold text-xs uppercase tracking-wider rounded hover:bg-gray-100 transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmAnalysis}
                  className="px-5 py-2 bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs uppercase tracking-wider rounded transition-all flex items-center gap-1.5 shadow-md"
                >
                  <CheckCircle2 className="w-4 h-4" /> Confirm &amp; Analyse
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <nav className="flex text-gray-400 text-[10px] font-bold uppercase tracking-widest gap-2 items-center mb-1">
            <span>Projects</span>
            <ArrowRight className="w-3 h-3" />
            <span className="truncate max-w-[280px]" title={projectName}>{projectName}</span>
            <ArrowRight className="w-3 h-3" />
            <span className="text-orange-600">AI Analysis</span>
          </nav>
          <h1 className="font-sans text-2xl font-bold text-gray-950">AI Progress Analysis</h1>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-[10px] uppercase tracking-wider font-bold text-gray-400">Attach scan to:</span>
          <select
            data-testid="attach-scan-project"
            value={selectedProjectId ?? ""}
            onChange={(e) => {
              const id = e.target.value ? Number(e.target.value) : null;
              setSelectedProjectId(id);
              // Propagate up so the header switcher and dashboard stay in sync.
              if (id != null) onSelectProject?.(id);
            }}
            className="bg-white border border-gray-200 px-3 py-2 rounded font-bold text-slate-900"
          >
            {(overview?.projects || []).map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
            {(!overview?.projects || overview.projects.length === 0) && <option value="">No projects yet</option>}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Capture Interface */}
        <div className="lg:col-span-7">
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden flex flex-col h-[500px] shadow-sm">
            <div className="bg-slate-900 text-white px-6 py-4 flex justify-between items-center flex-shrink-0">
              <span className="font-sans font-bold text-xs uppercase tracking-wider">Site Capture</span>
              <span className="px-2.5 py-0.5 bg-orange-600/10 text-orange-500 font-extrabold text-[10px] rounded uppercase tracking-wider border border-orange-500/20 animate-pulse">
                Live Feed
              </span>
            </div>

            <div className="flex-1 flex flex-col md:flex-row divide-y md:divide-y-0 md:divide-x divide-gray-200 h-full overflow-hidden">
              {/* Real device camera — captures are geolocated and geofenced to the site */}
              <div className="flex-1 relative bg-black h-1/2 md:h-full overflow-hidden">
                <video
                  ref={videoRef}
                  playsInline
                  muted
                  className={`w-full h-full object-cover ${cameraOn ? "opacity-100" : "opacity-0"}`}
                />
                {!cameraOn && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-gradient-to-b from-slate-800 to-slate-950">
                    <Camera className="text-white w-12 h-12 mb-4 drop-shadow-md" />
                    <h3 className="font-sans text-lg font-bold text-white mb-2">Device Camera</h3>
                    <p className="text-white/70 text-xs max-w-[220px] mb-2 leading-relaxed">
                      Live on-site shot. Location-checked — you must be at the project site.
                    </p>
                    <span className="text-emerald-300/90 text-[10px] font-bold uppercase tracking-wider mb-3">Production method</span>
                    {cameraError && <p className="text-red-300 text-[10px] max-w-[220px] mb-3">{cameraError}</p>}
                    <button
                      onClick={startCamera}
                      disabled={running}
                      className="bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 rounded h-10 font-bold text-xs uppercase tracking-wider transition-all shadow-md flex items-center gap-1.5 disabled:opacity-50"
                    >
                      <Camera className="w-4 h-4" /> Start camera
                    </button>
                  </div>
                )}
                {cameraOn && (
                  <div className="absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-black/80 via-black/40 to-transparent flex items-center justify-center gap-3">
                    <button
                      onClick={captureAndAnalyze}
                      disabled={running || locating}
                      className="bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white px-4 py-2 rounded font-bold text-xs uppercase tracking-wider shadow-md flex items-center gap-1.5"
                    >
                      <Camera className="w-4 h-4" /> {locating ? "Getting location…" : "Capture & analyse"}
                    </button>
                    <button
                      onClick={stopCamera}
                      className="bg-white/10 hover:bg-white/20 text-white px-3 py-2 rounded font-bold text-xs uppercase tracking-wider flex items-center gap-1.5"
                    >
                      <VideoOff className="w-4 h-4" /> Stop
                    </button>
                  </div>
                )}
              </div>

              {/* Local upload — PRESENTATION ONLY (geofence-exempt). Hidden in production. */}
              <div
                className={`flex-1 flex flex-col items-center justify-center p-6 text-center transition-all h-1/2 md:h-full ${
                  dragOver ? "bg-sky-50/50 border-orange-500" : "bg-gray-50 hover:bg-gray-100/50"
                }`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                <CloudUpload className={`w-12 h-12 mb-3 ${dragOver ? "text-orange-600" : "text-gray-400"}`} />
                <h3 className="font-sans text-lg font-bold text-slate-900 mb-1">Local Upload</h3>
                <span className="inline-block bg-amber-100 text-amber-800 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded mb-2">
                  Presentation only
                </span>
                <p className="text-gray-500 text-[11px] max-w-[220px] leading-relaxed mb-5">
                  For the panel demo, drop a sample court photo to run the analysis without being
                  on site. In production this is disabled — only the geofenced on-site camera is used.
                </p>

                <input
                  type="file"
                  id="file-upload"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="hidden"
                  ref={fileInputRef}
                  disabled={running}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={running}
                  className="px-5 py-2.5 border border-slate-900 text-slate-900 font-bold text-xs uppercase tracking-wider rounded bg-transparent hover:bg-slate-900 hover:text-white transition-all cursor-pointer disabled:opacity-50"
                >
                  Browse Files
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Status & Circular Gauge */}
        <div className="lg:col-span-5 flex flex-col justify-between gap-6">
          <div className="bg-white border border-gray-200 rounded-lg p-6 flex flex-col items-center justify-center shadow-sm flex-1">
            <div className="w-full flex justify-between items-center mb-8">
              <span className="font-sans font-bold text-[10px] text-gray-400 uppercase tracking-widest">
                Analysis Engine Status
              </span>
              <span className="flex items-center gap-1.5 font-mono text-[11px] font-bold text-orange-600">
                <span className="w-2 h-2 rounded-full bg-orange-600 animate-pulse"></span>
                {appState}
              </span>
            </div>

            {/* Circular Gauge */}
            <div className="relative w-56 h-56 mb-8 flex items-center justify-center">
              <svg className="w-full h-full transform -rotate-90">
                {/* Background Ring */}
                <circle
                  className="text-gray-100"
                  cx="112"
                  cy="112"
                  fill="transparent"
                  r="92"
                  stroke="currentColor"
                  strokeWidth="16"
                ></circle>
                {/* Progress Ring */}
                <circle
                  className={`text-orange-500 transition-all duration-500 ${running ? "animate-pulse" : ""}`}
                  cx="112"
                  cy="112"
                  fill="transparent"
                  r="92"
                  stroke="currentColor"
                  strokeWidth="16"
                  strokeDasharray={running ? `${circumference / 6} ${circumference}` : `${circumference}`}
                  strokeDashoffset={running ? 0 : circumference - (displayProgress / 100) * circumference}
                  strokeLinecap="round"
                  style={running ? { animation: "spin 1.2s linear infinite", transformOrigin: "112px 112px" } : undefined}
                ></circle>
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="font-sans font-bold text-4xl text-slate-900 tracking-tight">
                  {running ? "—" : displayProgress}
                  {!running && <span className="text-lg font-bold ml-0.5 text-gray-500">%</span>}
                </span>
                <span className="font-sans font-bold text-[10px] text-gray-400 uppercase tracking-wider mt-1">
                  {running ? "Running AI inference" : "Current progress"}
                </span>
              </div>
            </div>

            {/* Prediction Output */}
            <div className="w-full bg-gray-50 rounded p-4 border-l-4 border-slate-950">
              <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                Predicted Construction Stage
              </div>
              <div className={`font-sans text-md font-bold text-gray-900 ${activeStage === "Scanning..." ? "italic text-gray-400" : ""}`}>
                {activeStage}
              </div>
            </div>
          </div>

          {/* Financial summary meters */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-4">
            <div className="bg-white border border-gray-200 rounded-lg p-4 flex items-center gap-4 shadow-sm">
              <div className="p-2.5 bg-sky-50 text-slate-900 rounded border border-sky-100">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div>
                <div className="font-sans text-[10px] text-gray-400 font-bold uppercase tracking-wider">
                  Budget Consumed{activeBudget.estimated ? " · AI est." : ""}
                </div>
                <div className="font-mono text-lg font-bold text-slate-900 mt-0.5">
                  {activeBudget.consumed}
                </div>
                {activeBudget.estimated && (
                  <div className="text-[9px] text-gray-400 mt-0.5">Estimated from photo progress — no expenses logged yet</div>
                )}
              </div>
            </div>

            <div className="bg-white border border-gray-200 rounded-lg p-4 flex items-center gap-4 shadow-sm">
              <div className="p-2.5 bg-sky-50 text-slate-900 rounded border border-sky-100">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <div className="font-sans text-[10px] text-gray-400 font-bold uppercase tracking-wider">
                  Remaining Budget
                </div>
                <div className="font-mono text-lg font-bold text-slate-900 mt-0.5">
                  {activeBudget.remaining}
                </div>
              </div>
            </div>

            <div className="bg-white border border-gray-200 rounded-lg p-4 flex items-center gap-4 shadow-sm sm:col-span-2 lg:col-span-1">
              <div className="p-2.5 bg-orange-50 text-orange-600 rounded border border-orange-100">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <div className="font-sans text-[10px] text-gray-400 font-bold uppercase tracking-wider">
                  Projected Variance
                </div>
                <div className="flex justify-between items-center mt-0.5">
                  <div className="font-mono text-lg font-bold text-slate-900">
                    {activeBudget.variance}
                  </div>
                  <span className="text-[10px] font-bold text-gray-500 bg-gray-100 border border-gray-200 px-2 py-0.5 rounded uppercase">
                    Awaiting Scan
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Analysis History Cards Selection */}
      <section className="pt-4">
        <div className="flex justify-between items-center mb-6">
          <h2 className="font-sans text-lg font-bold text-slate-900">Recent Analysis History</h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {scans.slice(0, 4).map((scan) => (
            <div
              key={scan.id}
              onClick={() => onSelectScan(scan)}
              className="bg-white border border-gray-200 rounded-lg overflow-hidden group cursor-pointer hover:border-orange-500 transition-all hover:shadow-md"
            >
              <div className="h-32 bg-gray-100 relative overflow-hidden">
                <img
                  referrerPolicy="no-referrer"
                  src={scan.image}
                  alt={scan.title}
                  className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all duration-300"
                />
                <div className="absolute top-3 right-3 bg-slate-900/80 backdrop-blur-sm text-white text-[10px] font-bold px-2.5 py-1 rounded">
                  {scan.progress}% PROG
                </div>
                {caps.canUploadImage && onDeleteScan && (
                  <button
                    onClick={(e) => deleteScan(scan, e)}
                    disabled={deletingId === scan.id}
                    title="Delete analysis"
                    aria-label={`Delete ${scan.title}`}
                    className="absolute top-3 left-3 bg-white/90 hover:bg-red-600 hover:text-white text-red-600 rounded p-1.5 shadow-sm opacity-0 group-hover:opacity-100 transition-all disabled:opacity-60"
                  >
                    {deletingId === scan.id
                      ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      : <Trash2 className="w-3.5 h-3.5" />}
                  </button>
                )}
              </div>
              <div className="p-4">
                <div className="font-sans font-bold text-xs text-slate-900 uppercase tracking-wide mb-2 block truncate">
                  {scan.title}
                </div>
                <div className="flex justify-between items-center text-gray-400">
                  <span className="text-[10px] font-bold flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-gray-400" />
                    {scan.date}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function fmtBudget(n: number): string {
  const v = Math.abs(n);
  if (v >= 1_000_000) return `RWF ${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `RWF ${(v / 1_000).toFixed(1)}K`;
  return `RWF ${v.toFixed(0)}`;
}
