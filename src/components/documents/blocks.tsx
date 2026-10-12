/* eslint-disable @next/next/no-img-element -- document images are authenticated, tenant-scoped files; the optimizer would bypass the session check */
import type { CSSProperties, ReactNode } from "react";
import type { DocumentBranding } from "@/server/core/documents/types";

/**
 * Shared building blocks for document templates. Everything is sized in mm/pt and coloured explicitly, never with
 * theme tokens, so print output doesn't depend on screen settings (dark mode included).
 */

export function InstituteLogo({ branding, size }: { branding: DocumentBranding; size: string }) {
  if (!branding.logoUrl) return null;
  return <img src={branding.logoUrl} alt={`${branding.name} logo`} style={{ width: size, height: size, objectFit: "contain", flexShrink: 0 }} />;
}

/** The institute's name, address and contacts, with the logo, as a document header. */
export function DocumentHeader({ branding, title }: { branding: DocumentBranding; title: string }) {
  const contacts = [branding.phone, branding.email, branding.website].filter(Boolean).join(" · ");
  return (
    <header style={{ display: "flex", alignItems: "center", gap: "3mm", borderBottom: `0.6mm solid ${branding.primaryColor}`, paddingBottom: "2mm" }}>
      <InstituteLogo branding={branding} size="12mm" />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: "1.45em", fontWeight: 700, color: branding.primaryColor }}>{branding.name}</div>
        {branding.address && <div style={{ color: "#4b5563" }}>{branding.address}</div>}
        {contacts && <div style={{ color: "#4b5563" }}>{contacts}</div>}
      </div>
      <div style={{ fontSize: "1.2em", fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase" }}>{title}</div>
    </header>
  );
}

/** Label/value rows; rows with an empty value are skipped. */
export function FieldRows({ rows, style, labelWidth = "24mm" }: { rows: [string, ReactNode][]; style?: CSSProperties; labelWidth?: string }) {
  return (
    <table style={{ borderCollapse: "collapse", ...style }}>
      <tbody>
        {rows
          .filter(([, v]) => v !== null && v !== undefined && v !== "")
          .map(([label, value]) => (
            <tr key={label}>
              <th scope="row" style={{ textAlign: "left", fontWeight: 500, color: "#4b5563", width: labelWidth, padding: "0.3mm 1.5mm 0.3mm 0", verticalAlign: "top" }}>
                {label}
              </th>
              <td style={{ fontWeight: 600, padding: "0.3mm 0", verticalAlign: "top" }}>{value}</td>
            </tr>
          ))}
      </tbody>
    </table>
  );
}

export function SignatureLine({ signatory, width = "40mm" }: { signatory: DocumentBranding["signatories"][number]; width?: string }) {
  return (
    <div style={{ width, textAlign: "center" }}>
      <div style={{ height: "10mm", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
        {signatory.imageUrl && <img src={signatory.imageUrl} alt={`Signature of ${signatory.personName}`} style={{ maxHeight: "10mm", maxWidth: "100%", objectFit: "contain" }} />}
      </div>
      <div style={{ borderTop: "0.3mm solid #111827", paddingTop: "0.8mm", fontWeight: 600 }}>{signatory.title}</div>
      <div style={{ color: "#4b5563" }}>{signatory.personName}</div>
    </div>
  );
}

/** "12 Jun 2026" from a YYYY-MM-DD date, independent of the server's time zone. */
export function docDate(iso: string | null | undefined) {
  if (!iso) return "";
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
}
