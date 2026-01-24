// types/pageDetail.ts
import type { ReactNode } from "react";

/**
 * Standard paginated fetch result
 */
export interface PageDetailFetchResult<T> {
  data: T[];
  total: number;
}

/**
 * Fetch parameters shared across all PageDetail pages
 */
export interface PageDetailFetchParams {
  page: number;
  pageSize: number;
  search: string;
}

/**
 * Standard return shape for data-fetching hooks
 * (SWR / React Query compatible)
 */
export interface PageDetailFetchHookResult<T> {
  data?: PageDetailFetchResult<T>;
  isLoading: boolean;
  mutate: () => Promise<PageDetailFetchResult<T> | undefined>;
}

/**
 * Props passed into the table renderer
 */
export interface PageDetailTableProps<T> {
  rows: T[];
  selectedIds: Set<string>;
  toggleRow: (row: T) => void;
}

/**
 * Configuration contract for a PageDetail screen
 */
export interface PageDetailConfig<T> {
  /** Page identity */
  title: string;
  description?: string;

  /** Data */
  useFetch: (
    params: PageDetailFetchParams
  ) => PageDetailFetchHookResult<T>;

  /** Rendering */
  renderSummary?: (data: T[]) => ReactNode;
  renderFilters?: () => ReactNode;
  renderTable: (props: PageDetailTableProps<T>) => ReactNode;

  /** Selection rules */
  getRowId: (row: T) => string;
  isRowSelectable?: (row: T) => boolean;

  /** Bulk actions */
  onBulkDelete?: (ids: string[]) => Promise<void>;
}
