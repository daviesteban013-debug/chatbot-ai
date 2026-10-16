import type { JobKind } from "../types";
import type { Recipe } from "../worker";
import { catalogImport } from "./catalog-import";
import { catalogUpdate } from "./catalog-update";
import { collectionsReview } from "./collections-review";

export const recipes: Record<JobKind, Recipe> = { catalog_import: catalogImport, catalog_update: catalogUpdate, collections_review: collectionsReview };
