import type { ComponentType } from "react";
import type { DocumentTypeKey, TemplateProps } from "@/server/core/documents/types";
import { AttendanceRegisterTemplate } from "./attendance-register-template";
import { FeeReceiptTemplate } from "./fee-receipt-template";
import { FeeReportTemplate } from "./fee-report-template";

/** The template component that renders each document type (the fee receipt and report join with the Fees module). */
export const TEMPLATES: Partial<Record<DocumentTypeKey, ComponentType<TemplateProps>>> = { "fee-receipt": FeeReceiptTemplate, "fee-report": FeeReportTemplate, "attendance-register": AttendanceRegisterTemplate };
