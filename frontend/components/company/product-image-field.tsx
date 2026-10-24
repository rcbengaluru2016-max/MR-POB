"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import type { UploadedFile } from "@/lib/types";

type Props = { label: string; value?: UploadedFile | null; disabled?: boolean; onChange: (image: UploadedFile | null) => void; onProcessingChange: (busy: boolean) => void };

export function ProductImageField({ label, value, disabled, onChange, onProcessingChange }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  useEffect(() => {
    if (!cameraOpen) return;
    let cancelled = false;
    let stream: MediaStream | undefined;
    async function start() {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("Camera unavailable. Use HTTPS or localhost and a supported browser, or choose Upload Image.");
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1600 }, height: { ideal: 1200 } }, audio: false });
        if (cancelled) { stream.getTracks().forEach((track) => track.stop()); return; }
        if (video.current) { video.current.srcObject = stream; await video.current.play(); }
      } catch (reason) {
        stream?.getTracks().forEach((track) => track.stop());
        if (cancelled) return;
        const name = reason instanceof DOMException ? reason.name : "";
        setError(name === "NotAllowedError" ? "Camera access denied. Allow camera access in your browser settings, then try again, or choose Upload Image." : name === "NotFoundError" ? "No camera was found. Connect a camera or choose Upload Image." : name === "NotReadableError" ? "The camera is busy or unavailable. Close other camera apps and try again, or choose Upload Image." : reason instanceof Error ? reason.message : "Unable to open the camera. Choose Upload Image instead.");
        setCameraOpen(false);
      }
    }
    void start();
    return () => { cancelled = true; stream?.getTracks().forEach((track) => track.stop()); };
  }, [cameraOpen]);

  async function select(file: File) {
    setError(""); setBusy(true); onProcessingChange(true);
    try {
      if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 4 * 1024 * 1024 || !file.size) throw new Error("Choose a JPEG, PNG, or WebP image no larger than 4 MB.");
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("Unable to read this image. Please try again."));
        reader.readAsDataURL(file);
      });
      const image = new window.Image();
      image.src = dataUrl;
      await image.decode().catch(() => { throw new Error("This image could not be opened. Choose a valid image."); });
      if (mounted.current) { onChange({ name: file.name, type: file.type, size: file.size, dataUrl }); setCameraOpen(false); }
    } catch (reason) { if (mounted.current) setError(reason instanceof Error ? reason.message : "Unable to read image."); }
    finally { if (mounted.current) { setBusy(false); onProcessingChange(false); } }
  }

  async function capture() {
    if (!video.current?.videoWidth) return;
    setBusy(true); onProcessingChange(true); setError("");
    try {
      const canvas = document.createElement("canvas");
      canvas.width = video.current.videoWidth; canvas.height = video.current.videoHeight;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Unable to capture a photo. Choose Upload Image instead.");
      context.drawImage(video.current, 0, 0);
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((result) => result ? resolve(result) : reject(new Error("Unable to capture the photo. Try again.")), "image/jpeg", 0.9));
      if (mounted.current) await select(new File([blob], `product-${Date.now()}.jpg`, { type: "image/jpeg" }));
    } catch (reason) { if (mounted.current) setError(reason instanceof Error ? reason.message : "Unable to capture photo."); }
    finally { if (mounted.current) { setBusy(false); onProcessingChange(false); } }
  }

  return <fieldset className="company-image-field min-w-0" disabled={disabled || busy}>
    <legend>{label} *</legend><span>JPEG, PNG or WebP · up to 4 MB</span>
    {value && <Image className="company-image-preview" src={value.dataUrl} alt={`${label} preview`} width={320} height={130} unoptimized />}
    <input ref={input} className="sr-only" tabIndex={-1} type="file" accept="image/jpeg,image/png,image/webp" aria-label={`Upload ${label}`} onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void select(file); }} />
    <div className="flex flex-wrap gap-2">
      <button type="button" className="company-secondary-button" onClick={() => input.current?.click()}>{value ? "Replace Image" : "Upload Image"}</button>
      <button type="button" className="company-secondary-button" onClick={() => { setError(""); setReady(false); setCameraOpen(true); }}>{value ? "Retake Photo" : "Take Photo"}</button>
      {value && <button type="button" className="company-table-action danger" onClick={() => { onChange(null); setError(""); }}>Remove</button>}
    </div>
    {cameraOpen && <div className="space-y-2" role="region" aria-label={`Camera for ${label}`}>
      <video ref={video} autoPlay muted playsInline className="max-h-64 w-full rounded-lg bg-black" onLoadedData={() => setReady(true)} />
      <p className="text-xs font-normal">{ready ? "Position the product, then capture your photo." : "Opening camera…"}</p>
      <div className="flex flex-wrap gap-2"><button type="button" disabled={!ready} className="company-primary-button" onClick={() => void capture()}>Capture Photo</button><button type="button" className="company-secondary-button" onClick={() => setCameraOpen(false)}>Cancel Camera</button></div>
    </div>}
    {busy && <p role="status">Preparing image…</p>}
    {error && <p className="company-error" role="alert">{error}</p>}
  </fieldset>;
}
