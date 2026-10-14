import { cache } from "react";
import { db } from "../../core/db/client";
import { getPublicWebsite } from "./public";

/** The public website for one request: the page and its metadata share a single load. */
export const loadPublicWebsite = cache((tenantId: string) => getPublicWebsite(db, tenantId));
