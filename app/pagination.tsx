"use client";

import { useState } from "react";
import {
  MAX_PRODUCT_PAGE_SIZE,
  PRODUCT_PAGE_SIZE,
  PRODUCT_PAGE_SIZE_OPTIONS,
  paginateItems,
} from "./pagination-core";

export {
  MAX_PRODUCT_PAGE_SIZE,
  PRODUCT_PAGE_SIZE,
  PRODUCT_PAGE_SIZE_OPTIONS,
  paginateItems,
} from "./pagination-core";

export function usePagination<T>(items: T[], resetKey: unknown = items) {
  const [state, setState] = useState({ page: 1, pageSize: PRODUCT_PAGE_SIZE, resetKey });
  const activeState = Object.is(state.resetKey, resetKey)
    ? state
    : { ...state, page: 1, resetKey };
  const result = paginateItems(items, activeState.page, activeState.pageSize);

  return {
    ...result,
    setPage: (next: number) => setState({
      ...activeState,
      page: Math.max(1, Math.min(result.totalPages, next)),
    }),
    setPageSize: (next: number) => setState({
      page: 1,
      pageSize: Math.min(MAX_PRODUCT_PAGE_SIZE, Math.max(1, next)),
      resetKey,
    }),
  };
}

export default function PaginationControls({
  page,
  totalPages,
  start,
  end,
  total,
  pageSize,
  onPageChange,
  onPageSizeChange,
}: {
  page: number;
  totalPages: number;
  start: number;
  end: number;
  total: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}) {
  if (!total) return null;
  return <div className="pagination" aria-label="产品分页">
    <span><b>{start + 1}–{end}</b> / 共 {total} 款</span>
    <div>
      <button onClick={() => onPageChange(1)} disabled={page === 1} aria-label="第一页">首页</button>
      <button onClick={() => onPageChange(page - 1)} disabled={page === 1} aria-label="上一页">上一页</button>
      <label>第
        <select value={page} onChange={(event) => onPageChange(Number(event.target.value))}>
          {Array.from({ length: totalPages }, (_, index) => index + 1).map(value => <option key={value} value={value}>{value}</option>)}
        </select>
        / {totalPages} 页
      </label>
      <button onClick={() => onPageChange(page + 1)} disabled={page === totalPages} aria-label="下一页">下一页</button>
      <button onClick={() => onPageChange(totalPages)} disabled={page === totalPages} aria-label="最后一页">末页</button>
    </div>
    <label className="page-size">每页
      <select value={pageSize} onChange={(event) => onPageSizeChange(Number(event.target.value))}>
        {PRODUCT_PAGE_SIZE_OPTIONS.map(value => <option key={value} value={value}>{value}</option>)}
      </select>
      款
    </label>
  </div>;
}
