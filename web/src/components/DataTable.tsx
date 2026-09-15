import { ReactNode, cloneElement, useEffect, useMemo, useRef, useState } from 'react';
import { Empty } from './ui';
import { IconChevronUp, IconChevronDown, IconColumns, IconDownload } from './icons';

const sizeIcon = (el: JSX.Element, px: number) => cloneElement(el, { width: px, height: px });

export interface DTColumn<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  /** Enables click-to-sort on this column. Return a comparable primitive. */
  sortAccessor?: (row: T) => string | number | Date;
  /** Value written to the exported CSV. Falls back to sortAccessor, else blank. */
  csvValue?: (row: T) => string | number;
  align?: 'left' | 'right';
  /** Hidden by default; the viewer can bring it back via the Columns menu. */
  defaultHidden?: boolean;
  /** Columns that shouldn't be offered in the Columns menu (e.g. the identifying column). */
  alwaysVisible?: boolean;
}

export interface DTBulkAction<T> {
  label: string;
  tone?: 'danger' | 'outline' | 'primary';
  onClick: (rows: T[]) => void;
}

/** Click-outside-aware popover, styled with the existing `.menu` primitives. */
function Popover({ trigger, children, align = 'right' }: { trigger: ReactNode; children: ReactNode; align?: 'left' | 'right' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const click = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', click);
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('mousedown', click); document.removeEventListener('keydown', key); };
  }, [open]);
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <span onClick={() => setOpen((o) => !o)}>{trigger}</span>
      {open && <div className={`menu${align === 'right' ? ' menu-right' : ''}`} onClick={() => setOpen(false)} role="menu">{children}</div>}
    </div>
  );
}

function toCsv<T>(columns: DTColumn<T>[], rows: T[]): string {
  const cols = columns.filter((c) => c.csvValue || c.sortAccessor);
  const esc = (v: unknown) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = cols.map((c) => esc(c.header)).join(',');
  const body = rows.map((r) => cols.map((c) => esc((c.csvValue ?? c.sortAccessor)?.(r))).join(',')).join('\n');
  return `${head}\n${body}`;
}

export function DataTable<T>({
  columns, rows, rowKey, loading, error, emptyIcon, emptyTitle = 'Nothing here yet', emptyText,
  pageSize = 10, selectable, bulkActions, exportFilename, rowActions, storageKey,
}: {
  columns: DTColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string | number;
  loading?: boolean;
  error?: string | null;
  emptyIcon?: string;
  emptyTitle?: string;
  emptyText?: string;
  pageSize?: number;
  selectable?: boolean;
  bulkActions?: DTBulkAction<T>[];
  exportFilename?: string;
  rowActions?: (row: T) => ReactNode;
  storageKey?: string;
}) {
  const [hidden, setHidden] = useState<Set<string>>(() => {
    const fromDefault = new Set(columns.filter((c) => c.defaultHidden).map((c) => c.key));
    if (!storageKey) return fromDefault;
    try {
      const saved = localStorage.getItem(`sokoni-cols:${storageKey}`);
      return saved ? new Set(JSON.parse(saved)) : fromDefault;
    } catch { return fromDefault; }
  });
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null);
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<string | number>>(new Set());

  useEffect(() => { setPage(0); }, [rows.length]);
  useEffect(() => {
    // Drop selections for rows that no longer exist (e.g. after a reload/filter change).
    const keys = new Set(rows.map(rowKey));
    setSelected((prev) => {
      const next = new Set([...prev].filter((k) => keys.has(k)));
      return next.size === prev.size ? prev : next;
    });
  }, [rows, rowKey]);

  const toggleCol = (key: string) => {
    setHidden((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      if (storageKey) { try { localStorage.setItem(`sokoni-cols:${storageKey}`, JSON.stringify([...next])); } catch { /* ignore */ } }
      return next;
    });
  };

  const visibleCols = columns.filter((c) => !hidden.has(c.key));

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.sortAccessor) return rows;
    return [...rows].sort((a, b) => {
      const av = col.sortAccessor!(a), bv = col.sortAccessor!(b);
      if (av < bv) return -1 * sort.dir;
      if (av > bv) return 1 * sort.dir;
      return 0;
    });
  }, [rows, sort, columns]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const pageRows = sorted.slice(page * pageSize, page * pageSize + pageSize);

  const onSort = (col: DTColumn<T>) => {
    if (!col.sortAccessor) return;
    setSort((s) => (s?.key === col.key ? (s.dir === 1 ? { key: col.key, dir: -1 } : null) : { key: col.key, dir: 1 }));
  };

  const allOnPageSelected = pageRows.length > 0 && pageRows.every((r) => selected.has(rowKey(r)));
  const toggleAllOnPage = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allOnPageSelected) pageRows.forEach((r) => next.delete(rowKey(r)));
      else pageRows.forEach((r) => next.add(rowKey(r)));
      return next;
    });
  };
  const toggleRow = (r: T) => {
    setSelected((prev) => {
      const next = new Set(prev);
      const k = rowKey(r);
      next.has(k) ? next.delete(k) : next.add(k);
      return next;
    });
  };
  const selectedRows = rows.filter((r) => selected.has(rowKey(r)));

  const doExport = () => {
    const csv = toCsv(columns, sorted);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${exportFilename || 'export'}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const showToolbar = selectable || exportFilename || columns.some((c) => !c.alwaysVisible);

  if (error) return <Empty icon="⚠️" title="Couldn't load this" text={error} />;
  if (!loading && rows.length === 0) return <Empty icon={emptyIcon} title={emptyTitle} text={emptyText} />;

  return (
    <div className="card">
      {showToolbar && (
        <div className="card-head">
          <span className="sub">
            {selectedRows.length > 0
              ? <strong style={{ color: 'var(--text)' }}>{selectedRows.length} selected</strong>
              : `${sorted.length} result${sorted.length === 1 ? '' : 's'}`}
          </span>
          <div className="row" style={{ gap: 8 }}>
            {selectedRows.length > 0 && bulkActions?.map((a) => (
              <button
                key={a.label}
                className={`btn btn-sm ${a.tone === 'danger' ? 'btn-danger' : a.tone === 'primary' ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => a.onClick(selectedRows)}
              >
                {a.label}
              </button>
            ))}
            {selectedRows.length === 0 && columns.some((c) => !c.alwaysVisible) && (
              <Popover trigger={<button type="button" className="btn btn-outline btn-sm">{sizeIcon(IconColumns, 16)}Columns</button>}>
                <div className="menu-label">Show columns</div>
                {columns.filter((c) => !c.alwaysVisible).map((c) => (
                  <label key={c.key} className="menu-item" style={{ cursor: 'pointer' }} onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" checked={!hidden.has(c.key)} onChange={() => toggleCol(c.key)} />
                    {c.header}
                  </label>
                ))}
              </Popover>
            )}
            {selectedRows.length === 0 && exportFilename && (
              <button type="button" className="btn btn-outline btn-sm" onClick={doExport}>{sizeIcon(IconDownload, 16)}Export</button>
            )}
          </div>
        </div>
      )}

      <div className="table-wrap">
        <table className="tbl">
          <thead>
            <tr>
              {selectable && (
                <th style={{ width: 36 }}>
                  <input type="checkbox" checked={allOnPageSelected} onChange={toggleAllOnPage} aria-label="Select all on page" />
                </th>
              )}
              {visibleCols.map((c) => (
                <th
                  key={c.key}
                  className={c.align === 'right' ? 'num' : undefined}
                  style={{ cursor: c.sortAccessor ? 'pointer' : undefined, userSelect: 'none' }}
                  onClick={() => onSort(c)}
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    {c.header}
                    {c.sortAccessor && sort?.key === c.key && sizeIcon(sort.dir === 1 ? IconChevronUp : IconChevronDown, 13)}
                  </span>
                </th>
              ))}
              {rowActions && <th />}
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: Math.min(pageSize, 6) }).map((_, i) => (
                <tr key={i}>
                  {selectable && <td><div className="skeleton" style={{ width: 16, height: 16 }} /></td>}
                  {visibleCols.map((c) => <td key={c.key}><div className="skeleton" style={{ height: 14, width: `${55 + (i * 13) % 35}%` }} /></td>)}
                  {rowActions && <td><div className="skeleton" style={{ height: 14, width: 60 }} /></td>}
                </tr>
              ))
              : pageRows.map((r) => (
                <tr key={rowKey(r)} data-selected={selected.has(rowKey(r)) ? 'true' : undefined}>
                  {selectable && (
                    <td><input type="checkbox" checked={selected.has(rowKey(r))} onChange={() => toggleRow(r)} aria-label="Select row" /></td>
                  )}
                  {visibleCols.map((c) => <td key={c.key} className={c.align === 'right' ? 'num' : undefined}>{c.render(r)}</td>)}
                  {rowActions && <td>{rowActions(r)}</td>}
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {!loading && pageCount > 1 && (
        <div className="card-foot row-between">
          <span className="sub">Page {page + 1} of {pageCount}</span>
          <div className="row" style={{ gap: 8 }}>
            <button type="button" className="btn btn-outline btn-sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</button>
            <button type="button" className="btn btn-outline btn-sm" disabled={page >= pageCount - 1} onClick={() => setPage((p) => p + 1)}>Next</button>
          </div>
        </div>
      )}
    </div>
  );
}
