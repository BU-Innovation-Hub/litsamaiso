import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Download, Filter, Search, X } from 'lucide-react';
import { toast } from 'sonner';
import { auditLogService } from '../services/auditLogService';
import apiClient from '../lib/api';
import type { AuditLog } from '../types';
import { getApiErrorMessage } from '../utils/apiError';

const AuditLogsPage: React.FC = () => {
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [filterAction, setFilterAction] = useState('');
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');
  const filterRef = useRef<HTMLDivElement>(null);

  const limit = 20;

  const loadLogs = useCallback(async () => {
    setLoading(true);
    try {
      const response = await auditLogService.getAuditLogs({
        page,
        limit,
        search: search || undefined,
        action: filterAction || undefined,
        startDate: filterStartDate || undefined,
        endDate: filterEndDate || undefined,
      });
      setAuditLogs(response.auditLogs || []);
      setPage(response.page);
      setTotalPages(response.pages);
      setTotal(response.total);
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error, 'Failed to fetch audit logs'));
    } finally {
      setLoading(false);
    }
  }, [page, search, filterAction, filterStartDate, filterEndDate]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadLogs();
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [loadLogs]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(event.target as Node)) {
        setShowFilters(false);
      }
    };
    if (showFilters) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showFilters]);

  const clearFilters = () => {
    setFilterAction('');
    setFilterStartDate('');
    setFilterEndDate('');
    setPage(1);
  };

  const handleDownload = async () => {
    try {
      const response = await apiClient.get('/audit-logs/export', {
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'audit-logs.txt');
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error, 'Failed to export audit logs'));
    }
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-ZA', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="min-h-screen bg-gray-50 pt-5 pb-10 mt-1">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Audit Logs</h1>
            <p className="mt-1 text-sm text-gray-500">
              Track all system-wide actions and changes
            </p>
          </div>
          <button
            type="button"
            onClick={handleDownload}
            className="inline-flex items-center gap-2 rounded-md bg-primary-clr px-4 py-2 text-sm font-semibold text-white hover:bg-primary-clr/90"
          >
            <Download className="h-4 w-4" />
            Download
          </button>
        </div>

        <div className="mt-6 rounded-lg bg-white shadow">
          <div className="flex flex-col gap-4 border-b border-gray-200 p-6 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <div className="relative w-full max-w-md">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
                placeholder="Search across all columns..."
                className="w-full rounded-md border border-gray-300 py-2 pl-10 pr-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="relative" ref={filterRef}>
              <button
                type="button"
                onClick={() => setShowFilters(!showFilters)}
                className={`inline-flex items-center rounded-md border p-2 transition ${
                  showFilters || filterAction || filterStartDate || filterEndDate
                    ? 'border-gray-400 bg-gray-100 text-gray-600'
                    : 'border-gray-300 text-gray-400 hover:bg-gray-100'
                }`}
              >
                <Filter className="h-4 w-4" />
              </button>
              {showFilters && (
                <div className="absolute right-0 z-50 mt-2 w-72 rounded-lg border border-gray-200 bg-white p-4 shadow-lg">
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-sm font-semibold text-gray-900">Filters</span>
                    <button
                      type="button"
                      onClick={() => setShowFilters(false)}
                      className="text-gray-400 hover:text-gray-600"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="space-y-3">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-gray-600">Action</label>
                      <input
                        value={filterAction}
                        onChange={(e) => setFilterAction(e.target.value)}
                        placeholder="e.g. http.post"
                        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-gray-600">From date</label>
                      <input
                        type="date"
                        value={filterStartDate}
                        onChange={(e) => setFilterStartDate(e.target.value)}
                        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-gray-600">To date</label>
                      <input
                        type="date"
                        value={filterEndDate}
                        onChange={(e) => setFilterEndDate(e.target.value)}
                        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                  <div className="mt-4 flex justify-between">
                    <button
                      type="button"
                      onClick={() => {
                        clearFilters();
                        setShowFilters(false);
                      }}
                      className="text-sm text-gray-500 hover:text-gray-700"
                    >
                      Clear all
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowFilters(false)}
                      className="rounded-md bg-primary-clr px-4 py-1.5 text-sm font-semibold text-white hover:bg-primary-clr/90"
                    >
                      Apply
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
          <p className="text-sm text-gray-500">
            {total} log{total !== 1 ? 's' : ''} found
          </p>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Action</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Actor</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Role</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Endpoints</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {loading ? (
                  <tr><td colSpan={5} className="px-6 py-6 text-center text-gray-500">Loading...</td></tr>
                ) : auditLogs.length === 0 ? (
                  <tr><td colSpan={5} className="px-6 py-6 text-center text-gray-500">No audit logs found</td></tr>
                ) : (
                  auditLogs.map((log) => (
                    <tr key={log._id} className="hover:bg-gray-50">
                      <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-gray-900">
                        {log.action}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                        {log.actorEmail || '-'}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                        {log.actorRole || '-'}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500 max-w-md">
                        <span
                          className="truncate block font-mono text-xs text-gray-600"
                          title={String(log.details?.path ?? '-')}
                        >
                          {String(log.details?.path ?? '-')}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                        {formatDate(log.createdAt)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-gray-200 px-6 py-4">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(p - 1, 1))}
                className="inline-flex items-center gap-1 rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </button>
              <div className="flex items-center gap-2">
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 2)
                  .map((p, idx, arr) => (
                    <React.Fragment key={p}>
                      {idx > 0 && arr[idx - 1] !== p - 1 && (
                        <span className="px-1 text-gray-400">...</span>
                      )}
                      <button
                        type="button"
                        onClick={() => setPage(p)}
                        className={`min-w-[2.25rem] rounded-md px-3 py-2 text-sm font-medium ${
                          p === page
                            ? 'bg-primary-clr text-white'
                            : 'border border-gray-300 text-gray-700 hover:bg-gray-50'
                        }`}
                      >
                        {p}
                      </button>
                    </React.Fragment>
                  ))}
              </div>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
                className="inline-flex items-center gap-1 rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AuditLogsPage;
