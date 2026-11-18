import React, { useState } from 'react';
import { Check, Copy, Download } from 'lucide-react';
import { OPTIMIZED_TECH_SPEC_MARKDOWN } from '../data/techSpecMarkdown';

export const MarkdownSpecViewer: React.FC = () => {
  const [viewMode, setViewMode] = useState<'rendered' | 'raw'>('rendered');
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(OPTIMIZED_TECH_SPEC_MARKDOWN);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback if clipboard permission restricted
      setCopied(false);
    }
  };

  const handleDownload = () => {
    const blob = new Blob([OPTIMIZED_TECH_SPEC_MARKDOWN], {
      type: 'text/markdown;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = '红果短剧电商商家赋能工具_优化版技术方案_v2.0.md';
    a.click();
    URL.revokeObjectURL(url);
  };

  const lines = OPTIMIZED_TECH_SPEC_MARKDOWN.split('\n');

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-5 py-3.5">
        <div
          role="group"
          aria-label="文档查看模式"
          className="inline-flex items-center gap-1 rounded-lg bg-slate-100 p-1"
        >
          <button
            type="button"
            onClick={() => setViewMode('rendered')}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
              viewMode === 'rendered'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            结构化阅读
          </button>
          <button
            type="button"
            onClick={() => setViewMode('raw')}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
              viewMode === 'raw'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Markdown 原文
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap cursor-pointer"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? '已复制 Markdown' : '复制 Markdown'}
          </button>
          <button
            type="button"
            onClick={handleDownload}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap cursor-pointer"
          >
            <Download className="h-3.5 w-3.5" />
            下载 .md 方案
          </button>
          <a
            href="/api/download/repo.zip"
            download="douyin-hongguo-v1.1-with-git.zip"
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-medium text-white hover:bg-slate-800 whitespace-nowrap"
          >
            <Download className="h-3.5 w-3.5" />
            下载完整源码 + Git (.zip)
          </a>
        </div>
      </div>

      {viewMode === 'raw' ? (
        <pre className="overflow-x-auto rounded-xl border border-slate-200 bg-slate-900 p-6 font-mono text-xs text-slate-100 leading-relaxed whitespace-pre-wrap">
          {OPTIMIZED_TECH_SPEC_MARKDOWN}
        </pre>
      ) : (
        <article className="rounded-xl border border-slate-200 bg-white p-6 md:p-8 space-y-3 text-sm text-slate-700 leading-relaxed">
          {renderMarkdownLines(lines)}
        </article>
      )}
    </div>
  );
};

function renderMarkdownLines(lines: string[]): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let i = 0;
  let keyCounter = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith('```')) {
      const codeLines: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i]);
        i += 1;
      }
      nodes.push(
        <pre
          key={`code-${keyCounter++}`}
          className="my-3 overflow-x-auto rounded-lg bg-slate-900 p-4 font-mono text-xs text-slate-100 leading-relaxed"
        >
          <code>{codeLines.join('\n')}</code>
        </pre>,
      );
      i += 1;
      continue;
    }

    if (line.startsWith('|')) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].startsWith('|')) {
        tableLines.push(lines[i]);
        i += 1;
      }
      const rows = tableLines
        .filter((r) => !/^\|[\s-|]+\|$/.test(r.trim()))
        .map((r) =>
          r
            .split('|')
            .slice(1, -1)
            .map((cell) => cell.trim()),
        );
      if (rows.length > 0) {
        const [header, ...body] = rows;
        nodes.push(
          <div key={`tbl-${keyCounter++}`} className="my-4 overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                  {header.map((cell, idx) => (
                    <th key={idx} className="py-2.5 px-4 font-semibold">
                      {renderInlineCode(cell)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {body.map((row, rIdx) => (
                  <tr key={rIdx}>
                    {row.map((cell, cIdx) => (
                      <td key={cIdx} className="py-2.5 px-4 text-slate-700">
                        {renderInlineCode(cell)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>,
        );
      }
      continue;
    }

    if (line.startsWith('# ')) {
      nodes.push(
        <h1 key={`h1-${keyCounter++}`} className="text-xl font-bold text-slate-900 pt-2">
          {line.slice(2)}
        </h1>,
      );
    } else if (line.startsWith('## ')) {
      nodes.push(
        <h2 key={`h2-${keyCounter++}`} className="text-base font-semibold text-slate-900 pt-4 border-t border-slate-100">
          {line.slice(3)}
        </h2>,
      );
    } else if (line.startsWith('### ')) {
      nodes.push(
        <h3 key={`h3-${keyCounter++}`} className="text-sm font-semibold text-slate-900 pt-2">
          {line.slice(4)}
        </h3>,
      );
    } else if (line.startsWith('> ')) {
      nodes.push(
        <blockquote
          key={`bq-${keyCounter++}`}
          className="rounded-lg bg-slate-50 border border-slate-200 px-4 py-3 text-xs text-slate-700"
        >
          {renderInlineCode(line.slice(2))}
        </blockquote>,
      );
    } else if (line.startsWith('---')) {
      nodes.push(<hr key={`hr-${keyCounter++}`} className="border-slate-100 my-2" />);
    } else if (/^\d+\.\s/.test(line) || line.startsWith('- ')) {
      nodes.push(
        <p key={`li-${keyCounter++}`} className="pl-3 text-xs md:text-sm text-slate-700">
          {renderInlineCode(line)}
        </p>,
      );
    } else if (line.trim() !== '') {
      nodes.push(
        <p key={`p-${keyCounter++}`} className="text-xs md:text-sm text-slate-700">
          {renderInlineCode(line)}
        </p>,
      );
    }

    i += 1;
  }

  return nodes;
}

function renderInlineCode(text: string): React.ReactNode {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g);
  return parts.map((part, idx) => {
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code key={idx} className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-800">
          {part.slice(1, -1)}
        </code>
      );
    }
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={idx} className="font-semibold text-slate-900">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return part;
  });
}
