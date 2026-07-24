"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { clockIn } from "@/lib/actions/time";
import { uploadClockPhoto } from "@/lib/clock/photo-upload";
import { getCurrentLocation } from "@/lib/clock/geolocation";

type Stage = "loading" | "camera-error" | "location-error" | "live" | "submitting";

export function ClockCameraCapture({
  employeeId,
  projectId,
  notes,
  onSuccess,
  onCancel,
}: {
  employeeId: string;
  projectId: string | null;
  notes: string | null;
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const locationRef = useRef<Promise<{ latitude: number; longitude: number } | null> | null>(null);

  const [stage, setStage] = useState<Stage>("loading");

  function stopStream() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  async function requestCameraAndLocation() {
    // Kick off location in parallel with the camera permission prompt — one
    // slow/denied permission shouldn't hold up the other.
    locationRef.current = getCurrentLocation();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 640 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setStage("live");
    } catch {
      setStage("camera-error");
    }
  }

  function startCamera() {
    setStage("loading");
    requestCameraAndLocation();
  }

  useEffect(() => {
    // Initial stage is already "loading" — this just kicks off the async
    // permission requests; every setState inside it happens after an await,
    // never synchronously during this effect's commit.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    requestCameraAndLocation();
    return () => stopStream();
  }, []);

  async function handleCapture() {
    const video = videoRef.current;
    if (!video) return;

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/jpeg", 0.85)
    );
    if (!blob) {
      toast.error("Couldn't capture photo. Try again.");
      return;
    }

    setStage("submitting");
    stopStream();

    const location = await locationRef.current;
    if (!location) {
      setStage("location-error");
      return;
    }

    try {
      const photoPath = await uploadClockPhoto(employeeId, blob);
      await clockIn({
        project_id: projectId || undefined,
        notes: notes || undefined,
        clock_in_photo_path: photoPath,
        latitude: location.latitude,
        longitude: location.longitude,
      });
      onSuccess();
    } catch (e) {
      toast.error((e as Error).message);
      await startCamera(); // back to live preview so they can try again
    }
  }

  function handleCancel() {
    stopStream();
    onCancel();
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      <div className="flex items-center justify-between p-4">
        <span className="text-sm font-semibold text-white">Clock-In Photo</span>
        <button
          onClick={handleCancel}
          className="rounded-full p-2 text-white hover:bg-white/10"
          aria-label="Cancel"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="relative flex-1 overflow-hidden">
        <video ref={videoRef} playsInline muted className="h-full w-full object-cover" />

        {stage === "loading" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/80 text-white">
            <Loader2 className="h-6 w-6 animate-spin" />
            <p className="text-sm">Starting camera…</p>
          </div>
        )}

        {stage === "submitting" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/80 text-white">
            <Loader2 className="h-6 w-6 animate-spin" />
            <p className="text-sm">Clocking in…</p>
          </div>
        )}

        {stage === "camera-error" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/90 px-8 text-center text-white">
            <p className="text-sm">
              Camera access is required to clock in. Please allow camera permission and try again.
            </p>
            <div className="flex gap-3">
              <button onClick={startCamera} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
                Try Again
              </button>
              <button onClick={handleCancel} className="rounded-lg border border-white/30 px-4 py-2 text-sm font-semibold text-white">
                Cancel
              </button>
            </div>
          </div>
        )}

        {stage === "location-error" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/90 px-8 text-center text-white">
            <p className="text-sm">
              Location access is required to clock in. Please allow location permission and try again.
            </p>
            <div className="flex gap-3">
              <button onClick={startCamera} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
                Try Again
              </button>
              <button onClick={handleCancel} className="rounded-lg border border-white/30 px-4 py-2 text-sm font-semibold text-white">
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {stage === "live" && (
        <div className="flex items-center justify-center p-6">
          <button
            onClick={handleCapture}
            className="flex h-16 w-16 items-center justify-center rounded-full border-4 border-white bg-white/20 active:bg-white/40"
            aria-label="Capture photo"
          >
            <Camera className="h-6 w-6 text-white" />
          </button>
        </div>
      )}
    </div>
  );
}
