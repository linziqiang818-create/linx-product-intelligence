"use client";

import { useState } from "react";

export const PRODUCT_PAGE_SIZE = 150;

export function usePagination<T>(items: T[], pageSize = PRODUCT_PAGE_SIZE) {
  const [requestedPage, setRequestedPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const page = Math.min(requestedPage, totalPages);
  const start = items.length ? (page - 1) * pageSize : 0;
  const end = Math.min(start + pageSize, items.length);

  return {
    page,
    totalPages,
    start,
    end,
    pageItems: items.slice(start, end),
    setPage: (next: number) => setRequestedPage(Math.max(1, Math.min(totalPages, next))),
  };
}

export default function PaginationControls({
  page,
  totalPages,
  start,
  end,
  total,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  start: number;
  end: number;
  total: number;
  onPageChange: (page: number) => void;
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
    <small>每页最多 {PRODUCT_PAGE_SIZE} 款</small>
  </div>;
}
