import type { ComponentType } from "react";
import type { DocumentTypeKey, TemplateProps } from "@/server/core/documents/types";

/** The template component that renders each document type (the fee receipt and report join with the Fees module). */
export const TEMPLATES: Partial<Record<DocumentTypeKey, ComponentType<TemplateProps>>> = {};
