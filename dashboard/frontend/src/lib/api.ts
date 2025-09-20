import type { UploadResponse } from "../types";

const API_BASE = (import.meta as any).env?.VITE_API_BASE ?? "http://127.0.0.1:8000";

export async function uploadFile(file: File): Promise<UploadResponse> {
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(`${API_BASE}/upload-excel/`, {
    method: "POST",
    body: formData,
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

