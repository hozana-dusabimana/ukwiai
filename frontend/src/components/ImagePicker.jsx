import { useEffect, useRef, useState } from "react";

/**
 * Reusable image input that supports three capture modes:
 *  1. Live camera (uses navigator.mediaDevices.getUserMedia — works on
 *     desktop browsers and Chrome/Safari on mobile when served over HTTPS
 *     or from localhost).
 *  2. File picker with `capture="environment"` so mobile users get the
 *     OS camera UI directly when they tap "Choose file".
 *  3. Drag-and-drop onto the picker.
 *
 * Calls `onChange(file: File | null)` whenever the selected file changes.
 *
 * Props:
 *  - value: File | null               — current file (controlled by parent)
 *  - onChange: (File | null) => void
 *  - accept?: string                  — defaults to "image/*"
 *  - className?: string               — extra wrapper classes
 *  - disabled?: boolean
 */
export default function ImagePicker({
  value,
  onChange,
  accept = "image/*",
  className = "",
  disabled = false,
}) {
  const [mode, setMode] = useState("upload"); // 'upload' | 'camera'
  const [streaming, setStreaming] = useState(false);
  const [streamError, setStreamError] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(null);

  const fileInputRef = useRef(null);
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  // Maintain a preview URL whenever the parent's `value` changes
  useEffect(() => {
    if (!value) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(value);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [value]);

  const stopStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setStreaming(false);
  };

  // Cleanup on unmount
  useEffect(() => () => stopStream(), []);

  const startCamera = async () => {
    setStreamError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setStreamError("Your browser does not support camera access. Use the upload tab instead.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setStreaming(true);
    } catch (err) {
      const msg =
        err?.name === "NotAllowedError"
          ? "Camera access was blocked. Allow camera permission and try again, or switch to upload."
          : err?.name === "NotFoundError"
          ? "No camera detected on this device."
          : err?.message || "Could not start camera";
      setStreamError(msg);
    }
  };

  const captureFrame = () => {
    const video = videoRef.current;
    if (!video || !streaming) return;
    const w = video.videoWidth || 1280;
    const h = video.videoHeight || 720;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0, w, h);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const stamp = new Date().toISOString().replace(/[-:T.]/g, "").slice(0, 14);
        const file = new File([blob], `site_${stamp}.jpg`, { type: "image/jpeg" });
        onChange(file);
        stopStream();
        setMode("upload"); // jump back to preview
      },
      "image/jpeg",
      0.92
    );
  };

  const handleFiles = (fileList) => {
    if (!fileList || fileList.length === 0) return;
    const f = fileList[0];
    if (!f.type.startsWith("image/")) return;
    onChange(f);
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    if (disabled) return;
    handleFiles(e.dataTransfer.files);
  };

  const switchToCamera = async () => {
    setMode("camera");
    await startCamera();
  };

  const switchToUpload = () => {
    stopStream();
    setMode("upload");
  };

  const clearSelection = () => {
    onChange(null);
  };

  return (
    <div className={`space-y-3 ${className}`}>
      {/* Tab selector */}
      <div className="inline-flex bg-slate-100 rounded-lg p-1 text-sm">
        <button
          type="button"
          onClick={switchToUpload}
          disabled={disabled}
          className={`px-3 py-1.5 rounded-md transition-colors ${
            mode === "upload" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"
          }`}
        >
          📁 Upload / Drag &amp; drop
        </button>
        <button
          type="button"
          onClick={switchToCamera}
          disabled={disabled}
          className={`px-3 py-1.5 rounded-md transition-colors ${
            mode === "camera" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"
          }`}
        >
          📷 Take photo
        </button>
      </div>

      {/* Upload mode */}
      {mode === "upload" && (
        <>
          {previewUrl ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <img
                src={previewUrl}
                alt="Selected site"
                className="w-full h-64 object-contain rounded bg-slate-100"
              />
              <div className="flex items-center justify-between mt-3 text-xs">
                <div className="text-slate-500 truncate">
                  {value?.name} · {value && (value.size / 1024).toFixed(0)} KB
                </div>
                <button
                  type="button"
                  onClick={clearSelection}
                  className="text-rose-500 hover:underline"
                >
                  Remove
                </button>
              </div>
            </div>
          ) : (
            <label
              htmlFor="image-picker-input"
              onDragOver={(e) => {
                e.preventDefault();
                if (!disabled) setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              className={`block cursor-pointer rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
                dragOver
                  ? "border-ukwi-500 bg-ukwi-50"
                  : "border-slate-300 bg-slate-50 hover:border-ukwi-300 hover:bg-slate-100"
              } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
            >
              <div className="text-4xl mb-2">📤</div>
              <div className="font-medium text-slate-700">
                Drop a site photo here or <span className="text-ukwi-600">click to choose</span>
              </div>
              <div className="text-xs text-slate-500 mt-1">
                PNG, JPG, or WebP — up to 20 MB. On phones the camera opens directly.
              </div>
            </label>
          )}
          <input
            id="image-picker-input"
            ref={fileInputRef}
            type="file"
            accept={accept}
            capture="environment"
            disabled={disabled}
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
        </>
      )}

      {/* Camera mode */}
      {mode === "camera" && (
        <div className="rounded-lg border border-slate-200 bg-slate-900 overflow-hidden relative">
          {streamError ? (
            <div className="aspect-video flex items-center justify-center text-center text-sm text-slate-300 p-6">
              <div>
                <div className="text-4xl mb-3">📷</div>
                <div className="font-semibold text-white mb-1">Camera unavailable</div>
                <div className="text-slate-400">{streamError}</div>
                <button
                  type="button"
                  onClick={startCamera}
                  className="btn-secondary mt-4 text-xs"
                >
                  Try again
                </button>
              </div>
            </div>
          ) : (
            <>
              <video
                ref={videoRef}
                playsInline
                autoPlay
                muted
                className="w-full aspect-video object-cover bg-black"
              />
              {streaming && (
                <div className="absolute top-2 left-2 inline-flex items-center gap-1.5 bg-rose-500 text-white text-[10px] font-semibold uppercase tracking-wide px-2 py-1 rounded-full">
                  <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
                  Live
                </div>
              )}
              <div className="absolute bottom-3 inset-x-0 flex justify-center">
                <button
                  type="button"
                  onClick={captureFrame}
                  disabled={!streaming}
                  className="w-16 h-16 rounded-full bg-white shadow-lg ring-4 ring-white/40 hover:scale-105 active:scale-95 transition-transform disabled:opacity-50 disabled:scale-100"
                  aria-label="Capture photo"
                >
                  <span className="block w-12 h-12 bg-rose-500 rounded-full mx-auto" />
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
