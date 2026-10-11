"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/api-client";
import { describeError } from "@/lib/feedback";

export type UploadCategory = "STUDENT_PHOTO" | "STAFF_PHOTO" | "LOGO" | "SIGNATURE";

const ACCEPTED = ["image/jpeg", "image/png", "image/webp"];
const LIMITS: Record<UploadCategory, number> = { STUDENT_PHOTO: 2, STAFF_PHOTO: 2, LOGO: 2, SIGNATURE: 1 };
export const ACCEPT_ATTRIBUTE = ACCEPTED.join(",");
export const limitMb = (category: UploadCategory) => LIMITS[category];

/**
 * Uploads one image to the files API for a category. Quick checks happen here for instant feedback; the server
 * re-checks everything and normalizes the image. Resolves to the new file id, or null when refused/failed.
 */
export function useImageUpload(category: UploadCategory) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File | undefined): Promise<string | null> {
    if (!file) return null;
    if (!ACCEPTED.includes(file.type)) {
      setError("Choose a JPG, PNG or WebP picture.");
      return null;
    }
    if (file.size > LIMITS[category] * 1024 * 1024) {
      setError(`The picture is too large. The limit is ${LIMITS[category]} MB.`);
      return null;
    }
    setError(null);
    setPending(true);
    try {
      const body = new FormData();
      body.set("category", category);
      body.set("file", file);
      return (await apiFetch<{ id: string }>("/api/v1/files", { method: "POST", body })).id;
    } catch (err) {
      setError(describeError(err, "Could not upload the picture."));
      return null;
    } finally {
      setPending(false);
    }
  }

  return { upload, pending, error };
}
