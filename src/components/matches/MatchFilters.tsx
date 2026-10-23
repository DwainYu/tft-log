import { RotateCcw, Search } from "lucide-react";
import { MISTAKE_TYPE_LIST, mistakeLabel } from "../../domain/labels";
import { encounterLabel } from "./EncounterSelector";
import { encounterRepository } from "../../data/tft/repositories";
import type { MatchQuery, PlacementFilter, ReviewedFilter, SortDir, SortField } from "../../domain/match/query";
import { Button } from "../ui/Button";
import { Field, Input, Select } from "../ui/Field";

const PLACEMENT_OPTIONS: { value: PlacementFilter; label: string }[] = [
  { value: "all", label: "全部名次" },
  { value: "top4", label: "Top4" },
  { value: "bottom4", label: "Bottom4" },
  { value: "win", label: "仅吃鸡" },
];

const REVIEWED_OPTIONS: { value: ReviewedFilter; label: string }[] = [
  { value: "all", label: "复盘状态：全部" },
  { value: "reviewed", label: "已复盘" },
  { value: "unreviewed", label: "未复盘" },
];

const SORT_OPTIONS: { value: SortField; label: string }[] = [
  { value: "playedAt", label: "按时间" },
  { value: "placement", label: "按名次" },
  { value: "duration", label: "按时长" },
  { value: "composition", label: "按阵容" },
];

export function MatchFilters({
  query,
  compositions,
  onChange,
  onReset,
}: {
  query: MatchQuery;
  compositions: string[];
  onChange: (patch: Partial<MatchQuery>) => void;
  onReset: () => void;
}) {
  const dirty =
    Boolean(query.search) ||
    Boolean(query.from) ||
    Boolean(query.to) ||
    (query.placement ?? "all") !== "all" ||
    (query.reviewed ?? "all") !== "all" ||
    (query.composition ?? "all") !== "all" ||
    (query.mistake ?? "all") !== "all" ||
    (query.encounterId ?? "all") !== "all";
  const encounters = encounterRepository.getEncounters();

  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="搜索" htmlFor="mq-search" className="lg:col-span-2">
          <div className="relative">
            <Search
              size={14}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-600"
            />
            <Input
              id="mq-search"
              value={query.search ?? ""}
              placeholder="阵容 / 棋子 / 装备 / 备注"
              className="pl-8"
              onChange={(e) => onChange({ search: e.target.value })}
            />
          </div>
        </Field>

        <Field label="名次区间" htmlFor="mq-placement">
          <Select
            id="mq-placement"
            value={query.placement ?? "all"}
            onChange={(e) => onChange({ placement: e.target.value as PlacementFilter })}
          >
            {PLACEMENT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="复盘" htmlFor="mq-reviewed">
          <Select
            id="mq-reviewed"
            value={query.reviewed ?? "all"}
            onChange={(e) => onChange({ reviewed: e.target.value as ReviewedFilter })}
          >
            {REVIEWED_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="阵容" htmlFor="mq-comp">
          <Select
            id="mq-comp"
            value={query.composition ?? "all"}
            onChange={(e) => onChange({ composition: e.target.value })}
          >
            <option value="all">全部阵容</option>
            {compositions.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="错误类型" htmlFor="mq-mistake">
          <Select
            id="mq-mistake"
            value={query.mistake ?? "all"}
            onChange={(e) => onChange({ mistake: e.target.value })}
          >
            <option value="all">全部类型</option>
            <option value="none">未分类</option>
            {MISTAKE_TYPE_LIST.map((t) => (
              <option key={t} value={t}>
                {mistakeLabel(t)}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="开局事件" htmlFor="mq-encounter">
          <Select
            id="mq-encounter"
            value={query.encounterId ?? "all"}
            onChange={(e) => onChange({ encounterId: e.target.value })}
          >
            <option value="all">全部开局事件</option>
            <option value="none">未记录开局事件</option>
            {encounters
              .filter((e) => e.isNone)
              .map((e) => (
                <option key={e.id} value={e.id}>
                  {encounterLabel(e)}
                </option>
              ))}
            <optgroup label="赛季开局事件">
              {encounters
                .filter((e) => !e.isNone)
                .map((e) => (
                  <option key={e.id} value={e.id}>
                    {encounterLabel(e)}
                  </option>
                ))}
            </optgroup>
          </Select>
        </Field>

        <Field label="开始日期" htmlFor="mq-from">
          <Input
            id="mq-from"
            type="date"
            value={query.from ?? ""}
            onChange={(e) => onChange({ from: e.target.value })}
          />
        </Field>
        <Field label="结束日期" htmlFor="mq-to">
          <Input
            id="mq-to"
            type="date"
            value={query.to ?? ""}
            onChange={(e) => onChange({ to: e.target.value })}
          />
        </Field>

        <Field label="排序">
          <div className="flex gap-2">
            <Select
              value={query.sortField ?? "playedAt"}
              onChange={(e) => onChange({ sortField: e.target.value as SortField })}
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
            <Button
              size="sm"
              className="shrink-0"
              onClick={() =>
                onChange({ sortDir: (query.sortDir ?? "desc") === "desc" ? "asc" : "desc" })
              }
              title="切换升序 / 降序"
            >
              {(query.sortDir ?? "desc") === "desc" ? "降序" : "升序"}
            </Button>
          </div>
        </Field>
      </div>

      {dirty && (
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={onReset}>
            <RotateCcw size={13} />
            清空筛选
          </Button>
          <span className="text-[11px] text-ink-600">筛选只影响这个列表，不会修改任何数据</span>
        </div>
      )}
    </div>
  );
}

export type { SortDir };
