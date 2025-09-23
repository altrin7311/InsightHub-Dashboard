import type { UploadResponse, TrainingRecord } from "../types";

// Use relative path if VITE_API_BASE is not set (for production)
const API_BASE =
  (import.meta as any).env?.VITE_API_BASE ||
  (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
    ? "http://localhost:8000"
    : "");

export async function uploadFile(file: File): Promise<UploadResponse> {
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(`${API_BASE}/upload-excel/`, {
    method: "POST",
    body: formData,
    credentials: "include", // Add this line
  });

  const contentType = res.headers.get("content-type") || "";
  const isJson = contentType.includes("application/json");
  if (!res.ok) {
    try {
      const body = isJson ? await res.json() : { detail: await res.text() };
      const detail = body?.detail || JSON.stringify(body) || `HTTP ${res.status}`;
      throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
    } catch (e: any) {
      throw new Error(e?.message || `Upload failed (HTTP ${res.status})`);
    }
  }

  return (isJson ? await res.json() : await res.json()) as UploadResponse;
}

export async function fetchTrainingResults(): Promise<{ real: TrainingRecord | null; augmented: TrainingRecord | null }> {
  const res = await fetch(`${API_BASE}/training/results`, {
    credentials: "include", // Add this line
  });
  if (!res.ok) {
    throw new Error(`Failed to load training results (HTTP ${res.status})`);
  }
  const json = await res.json();
  return {
    real: (json?.real as TrainingRecord | null) ?? null,
    augmented: (json?.augmented as TrainingRecord | null) ?? null,
  };
}
