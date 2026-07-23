export const PRODUCT_PAGE_SIZE = 60;
export const MAX_PRODUCT_PAGE_SIZE = 150;
export const PRODUCT_PAGE_SIZE_OPTIONS = [30, 60, 90, 150] as const;

export function paginateItems<T>(items: T[], requestedPage: number, requestedPageSize: number) {
  const pageSize = Math.min(MAX_PRODUCT_PAGE_SIZE, Math.max(1, Math.floor(requestedPageSize)));
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const page = Math.max(1, Math.min(Math.floor(requestedPage), totalPages));
  const start = items.length ? (page - 1) * pageSize : 0;
  const end = Math.min(start + pageSize, items.length);

  return { page, pageSize, totalPages, start, end, pageItems: items.slice(start, end) };
}
