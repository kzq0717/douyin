import React, { useState } from 'react';
import {
  EXPANSION_IDEAS,
  FEASIBILITY_DIMENSIONS,
  OPTIMIZATION_ITEMS,
  type OptimizationItem,
} from '../data/proposalAnalysis';

export const FeasibilityReport: React.FC = () => {
  const [severityFilter, setSeverityFilter] = useState<'all' | OptimizationItem['severity']>('all');

  const filteredOpts =
    severityFilter === 'all'
      ? OPTIMIZATION_ITEMS
      : OPTIMIZATION_ITEMS.filter((item) => item.severity === severityFilter);

  return (
    <div className="space-y-10">
      {/* 1. Feasibility Matrix */}
      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">
            01. 原方案（v1.0）六维可行性评估
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            总体结论：商业定位与合规红线成立，技术路线整体可行，但存在 OAuth 密钥泄露、FAISS 过度设计及 M0 审核周期低估三项关键问题。
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {FEASIBILITY_DIMENSIONS.map((dim) => (
            <div
              key={dim.dimension}
              className="rounded-xl border border-slate-200 bg-white p-5 flex flex-col justify-between gap-4"
            >
              <div className="space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-slate-900">{dim.dimension}</h3>
                  <span
                    className={`text-xs font-semibold whitespace-nowrap ${
                      dim.verdict === '高可行'
                        ? 'text-emerald-700'
                        : dim.verdict === '有条件可行'
                          ? 'text-amber-700'
                          : 'text-rose-600'
                    }`}
                  >
                    {dim.verdict}
                  </span>
                </div>
                <p className="text-xs text-slate-400">{dim.scoreLabel}</p>
                <p className="text-xs text-slate-600 leading-relaxed">{dim.summary}</p>
              </div>
              <div className="border-t border-slate-100 pt-3 text-xs text-slate-700 leading-relaxed">
                <span className="font-semibold text-slate-900">核心门禁：</span>
                {dim.keyGate}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 2. 8 Concrete Optimizations */}
      <section className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              02. 关键待优化项与 v2.0 工程重构对比
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              以下 8 项改进已同步落地至本应用的 src/core 核心引擎与 Express 瘦中继服务中。
            </p>
          </div>

          <div
            role="group"
            aria-label="优化优先级筛选"
            className="inline-flex items-center gap-1 rounded-lg bg-slate-100 p-1"
          >
            {(['all', '关键阻塞', '架构优化', '工程提效'] as const).map((lvl) => (
              <button
                key={lvl}
                type="button"
                onClick={() => setSeverityFilter(lvl)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  severityFilter === lvl
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {lvl === 'all' ? '全部 (8)' : lvl}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          {filteredOpts.map((opt) => (
            <div
              key={opt.id}
              className="rounded-xl border border-slate-200 bg-white p-6 space-y-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-slate-900">{opt.area}</h3>
                <span
                  className={`text-xs font-semibold ${
                    opt.severity === '关键阻塞'
                      ? 'text-rose-600'
                      : opt.severity === '架构优化'
                        ? 'text-amber-700'
                        : 'text-slate-600'
                  }`}
                >
                  [{opt.severity}]
                </span>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="rounded-lg bg-slate-50 p-3.5 text-xs space-y-1">
                  <div className="font-semibold text-slate-500">v1.0 原设计</div>
                  <p className="text-slate-700 leading-relaxed">{opt.v1Original}</p>
                </div>
                <div className="rounded-lg bg-slate-50 p-3.5 text-xs space-y-1">
                  <div className="font-semibold text-slate-900">v2.0 优化方案</div>
                  <p className="text-slate-800 leading-relaxed">{opt.v2Optimized}</p>
                </div>
              </div>

              <p className="text-xs text-slate-600 leading-relaxed">
                <strong className="font-semibold text-slate-900">工程依据：</strong>
                {opt.rationale}
              </p>

              <pre className="overflow-x-auto rounded-lg bg-slate-900 p-3.5 font-mono text-xs text-slate-100 leading-relaxed">
                <code>{opt.codeSnippet}</code>
              </pre>
            </div>
          ))}
        </div>
      </section>

      {/* 3. Expansion Roadmap */}
      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">
            03. 后续产品与商业化扩展想法（V2 → V4）
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            在不触碰平台合规红线的前提下，从“监控告警工具”向“剧方归因协同 + 本地视觉工作流”延伸。
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {EXPANSION_IDEAS.map((idea) => (
            <div
              key={idea.title}
              className="rounded-xl border border-slate-200 bg-white p-5 space-y-2.5"
            >
              <div className="text-xs font-medium text-slate-500">
                {idea.phase} · {idea.targetCustomer}
              </div>
              <h3 className="text-sm font-semibold text-slate-900">{idea.title}</h3>
              <p className="text-xs text-slate-600 leading-relaxed">{idea.valueProp}</p>
              <p className="pt-1 text-xs text-slate-500 font-mono">{idea.technicalPath}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};
