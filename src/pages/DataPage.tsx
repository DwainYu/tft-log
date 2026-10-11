import { useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { ClipboardCopy, Database, Download, FileJson, Plus, Sparkles, Trash2, Upload } from "lucide-react";
import {
  buildScopedExport,
  buildSnapshot,
  copyText,
  decisionsToCsv,
  downloadText,
  EXPORT_SCOPE_LABELS,
  EXPORT_SCOPES,
  importSnapshot,
  matchesToCsv,
  parseSnapshot,
  storageCounts,
  stampForFilename,
  wipeAll,
  type ExportScope,
} from "../services/export-service";
import { deleteAllScreenshots } from "../services/screenshot-service";
import { formatBytes } from "../domain/screenshot/screenshot";
import { getActiveSetData } from "../data/tft/registry";
import { loadDemoData, removeDemoData } from "../services/demo-service";
import {
  createSession,
  deleteSession,
  getSessions,
  setActiveSession,
  sessionMatchCounts,
  updateSession,
} from "../services/session-service";
import { SESSION_TYPE_LABELS } from "../domain/session/session";
import { SESSION_TYPES, type SessionType, type TrainingSession } from "../domain/types";
import { errorMessage } from "../lib/errors";
import { dateKey, wallClockNow } from "../lib/wallclock";
import { Badge, EmptyState } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Field, Input, Select } from "../components/ui/Field";
import { Modal } from "../components/ui/Modal";
import { PageHeader, Panel, PanelHeader } from "../components/ui/Panel";
import { Spinner } from "../components/ui/Spinner";
import { useToast } from "../components/ui/Toast";

interface SessionDraft {
  type: SessionType;
  name: string;
  description: string;
  startDate: string;
  endDate: string;
}

const emptyDraft = (): SessionDraft => ({
  type: "daily",
  name: "",
  description: "",
  startDate: dateKey(wallClockNow()),
  endDate: "",
});

export function DataPage() {
  const counts = useLiveQuery(storageCounts, []);
  const [confirmWipe, setConfirmWipe] = useState(false);
  const tft = getActiveSetData();
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const toast = useToast();

  const sessions = useLiveQuery(getSessions, []);
  const sessionCounts = useLiveQuery(sessionMatchCounts, []);
  const [editing, setEditing] = useState<TrainingSession | "new" | null>(null);
  const [draft, setDraft] = useState<SessionDraft>(emptyDraft);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [scope, setScope] = useState<ExportScope>("all");
  const [backupText, setBackupText] = useState<string | null>(null);

  if (counts === undefined) return <Spinner label="读取存储" />;
  const total = counts.matches + counts.decisions + counts.reviews + counts.trainingGoals;

  async function exportJson() {
    setBusy(true);
    try {
      const { snapshot, summary } = await buildScopedExport(scope);
      // The scope rides in the filename: a split file sitting next to a full
      // backup should be impossible to confuse for the other one.
      const suffix = scope === "all" ? "" : `-${scope}`;
      downloadText(
        `tft-log${suffix}-${stampForFilename()}.json`,
        JSON.stringify(snapshot, null, 2),
        "application/json",
      );
      toast.push(
        scope === "all"
          ? `已导出完整备份：${summary.matches} 对局 · ${summary.decisions} 决策 · ${summary.reviews} 复盘`
          : `已导出${EXPORT_SCOPE_LABELS[scope]}：${summary.sessions} Session · ${summary.matches} 对局 · ${summary.decisions} 决策 · ${summary.reviews} 复盘` +
              (summary.unclassifiedMatches
                ? `（其中 ${summary.unclassifiedMatches} 局没有可识别的 Session，按导入规则归入日常，未被丢弃）`
                : ""),
      );
    } catch (err) {
      toast.push(errorMessage(err), "warn");
    } finally {
      setBusy(false);
    }
  }

  async function exportCsv() {
    setBusy(true);
    try {
      const { snapshot } = await buildScopedExport(scope);
      const suffix = scope === "all" ? "" : `-${scope}`;
      downloadText(`tft-matches${suffix}-${stampForFilename()}.csv`, matchesToCsv(snapshot.matches), "text/csv");
      if (snapshot.decisions.length > 0) {
        downloadText(
          `tft-decisions${suffix}-${stampForFilename()}.csv`,
          decisionsToCsv(snapshot.decisions),
          "text/csv",
        );
      }
      toast.push("CSV 已导出");
    } catch (err) {
      toast.push(errorMessage(err), "warn");
    } finally {
      setBusy(false);
    }
  }

  /**
   * Embedded contexts (sandboxed iframes) can silently block blob downloads;
   * a copy path keeps the backup escape hatch working. If even the clipboard
   * refuses, the text goes into a selectable dialog instead of vanishing.
   */
  async function onCopyBackup() {
    setBusy(true);
    try {
      const snapshot = await buildSnapshot();
      const json = JSON.stringify(snapshot, null, 2);
      if (await copyText(json)) {
        toast.push("备份已复制到剪贴板，粘贴到文件即可保存");
      } else {
        setBackupText(json);
      }
    } catch (err) {
      toast.push(errorMessage(err), "warn");
    } finally {
      setBusy(false);
    }
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    try {
      const text = await file.text();
      const report = await importSnapshot(parseSnapshot(text));
      toast.push(
        `导入完成：${report.matches} 对局 · ${report.decisions} 决策 · ${report.reviews} 复盘 · ${report.trainingGoals} 目标` +
          (report.sessions ? ` · ${report.sessions} 训练 Session` : "") +
          (report.skipped ? `（${report.skipped} 条无效被跳过）` : ""),
      );
    } catch (err) {
      toast.push(errorMessage(err), "warn");
    } finally {
      setBusy(false);
    }
  }

  async function onLoadDemo() {
    setBusy(true);
    try {
      const report = await loadDemoData();
      toast.push(`示例数据已载入：${report.matches} 局虚构对局 · ${report.decisions} 决策 · ${report.reviews} 复盘 · ${report.trainingGoals} 目标`);
    } catch (err) {
      toast.push(errorMessage(err), "warn");
    } finally {
      setBusy(false);
    }
  }

  async function onClearDemo() {
    setBusy(true);
    try {
      const removed = await removeDemoData();
      toast.push(removed > 0 ? `已清除 ${removed} 条示例数据（真实数据保留）` : "没有示例数据");
    } catch (err) {
      toast.push(errorMessage(err), "warn");
    } finally {
      setBusy(false);
    }
  }

  async function onSetActive(id: string) {
    try {
      await setActiveSession(id);
      toast.push("当前训练已切换");
    } catch (err) {
      toast.push(errorMessage(err), "warn");
    }
  }

  function openCreate() {
    setDraft(emptyDraft());
    setEditing("new");
  }

  function openEdit(session: TrainingSession) {
    setDraft({
      type: session.type,
      name: session.name,
      description: session.description ?? "",
      startDate: session.startDate,
      endDate: session.endDate ?? "",
    });
    setEditing(session);
  }

  async function onSaveSession() {
    if (editing === null) return;
    const isCreate = editing === "new";
    setBusy(true);
    const input = {
      type: draft.type,
      name: draft.name,
      description: draft.description || undefined,
      startDate: draft.startDate,
      endDate: draft.endDate || undefined,
      active: isCreate ? true : editing.active,
    };
    try {
      if (isCreate) {
        await createSession(input);
        toast.push("Session 已创建");
      } else if (editing !== null) {
        await updateSession(editing.id, input);
        toast.push("Session 已更新");
      }
      setEditing(null);
    } catch (err) {
      toast.push(errorMessage(err), "warn");
    } finally {
      setBusy(false);
    }
  }

  function requestDeleteSession(session: TrainingSession) {
    const owned = sessionCounts?.[session.id] ?? 0;
    if (owned > 0) {
      toast.push(`该 Session 仍有 ${owned} 局比赛，不能删除。请先移动或删除这些比赛。`, "warn");
      return;
    }
    setConfirmDeleteId(session.id);
  }

  async function onConfirmDeleteSession(id: string) {
    setConfirmDeleteId(null);
    try {
      await deleteSession(id);
      toast.push("Session 已删除");
    } catch (err) {
      toast.push(errorMessage(err), "warn");
    }
  }

  return (
    <>
      <PageHeader title="数据" subtitle="数据 100% 保存在这台电脑的浏览器里 —— 随时可以带走" />

      <div className="flex flex-col gap-4">
        <Panel>
          <PanelHeader
            title="存储概况"
            action={
              <Badge tone="muted">
                <Database size={12} /> IndexedDB · 本机
              </Badge>
            }
          />
          <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4">
            <CountTile label="对局" value={counts.matches} />
            <CountTile label="决策" value={counts.decisions} />
            <CountTile label="复盘" value={counts.reviews} />
            <CountTile label="训练目标" value={counts.trainingGoals} />
            <CountTile label="结算截图" value={counts.screenshots} />
            <CountTile label="截图占用" value={formatBytes(counts.screenshotBytes)} />
          </div>
          {counts.screenshots > 0 && (
            <div className="flex flex-wrap items-center gap-3 border-t border-line px-4 py-3">
              <span className="text-[11px] leading-relaxed text-ink-600">
                截图保存在本机 IndexedDB，<strong className="text-ink-200">不会</strong>
                写进下面的 JSON / CSV 备份。换机器或清理浏览器数据前请先手动处理。
              </span>
              <Button
                size="sm"
                variant="danger"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await deleteAllScreenshots();
                    toast.push("本机截图已全部删除");
                  } catch (err) {
                    toast.push(errorMessage(err), "warn");
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <Trash2 size={13} />
                删除全部截图
              </Button>
            </div>
          )}
          {total === 0 && (
            <p className="border-t border-line px-4 py-3 text-xs text-ink-600">
              还没有数据。可以先「载入示例数据」看看每个页面长什么样，或者记录一局之后再回来备份。
            </p>
          )}
        </Panel>

        <div className="grid gap-4 lg:grid-cols-2">
          <Panel>
            <PanelHeader title="导出" subtitle="先选范围，再导出 JSON（备份）或 CSV（表格）" />
            <div className="flex flex-col gap-2 p-4">
              <Field label="导出范围" htmlFor="ex-scope">
                <Select
                  id="ex-scope"
                  value={scope}
                  onChange={(e) => setScope(e.target.value as ExportScope)}
                >
                  {EXPORT_SCOPES.map((s) => (
                    <option key={s} value={s}>
                      {EXPORT_SCOPE_LABELS[s]}
                    </option>
                  ))}
                </Select>
              </Field>

              <p className="text-[11px] leading-relaxed text-ink-600">
                {scope === "all"
                  ? "完整备份：所有 Session、对局、决策、复盘和训练目标，导入后可完整还原。"
                  : scope === "competition"
                    ? "只包含「云巅」类 Session，以及记在这些 Session 下的对局、决策和复盘。日常 Session 不会出现在这个文件里。"
                    : "只包含「日常」类 Session，以及记在这些 Session 下的对局、决策和复盘。没有可识别 Session 的旧记录也会留在这里（导入时归入日常训练），不会丢。"}
              </p>

              <Button variant="primary" onClick={exportJson} disabled={busy || total === 0}>
                <FileJson size={15} />
                Export JSON · {EXPORT_SCOPE_LABELS[scope]}
              </Button>
              <Button onClick={exportCsv} disabled={busy || counts.matches === 0}>
                <Download size={15} />
                Export CSV · {EXPORT_SCOPE_LABELS[scope]}
              </Button>
              <Button variant="ghost" onClick={onCopyBackup} disabled={busy || total === 0}>
                <ClipboardCopy size={15} />
                复制备份（下载被拦截时用）
              </Button>
              <p className="text-[11px] leading-relaxed text-ink-600">
                JSON 包含 matches / decisions / reviews / trainingGoals / trainingSessions 五张表，
                与本页导入格式一致，可以跨浏览器迁移或作为备份。训练目标是全局的，不按 Session
                切分，所以三种范围里都会带上。
                结算截图不在 JSON 里 —— 图片二进制不进备份文件，这也是旧备份格式能保持不变的原因。
                CSV 只能表达两张平表（对局、决策），复盘正文和 Session 明细都不在里面 —— 需要完整关系请用
                JSON。
              </p>
            </div>
          </Panel>

          <Panel>
            <PanelHeader title="导入" subtitle="合并导入：同 id 记录以文件内容覆盖（不比较新旧），新记录追加" />
            <div className="flex flex-col gap-2 p-4">
              <input ref={fileRef} type="file" accept=".json,application/json" onChange={onFile} className="hidden" id="import-json" />
              <Button onClick={() => fileRef.current?.click()} disabled={busy}>
                <Upload size={15} />
                Import JSON
              </Button>
              <p className="text-[11px] leading-relaxed text-ink-600">
                选择之前导出的 JSON 文件。导入采用合并策略：文件里的同 id 记录会直接替换本地那一条 ——
                重放旧备份会把本地更新过的记录倒写回去，想保住现状请先导出现状。
                对局缺少 sessionId 或引用了未知 Session 时，会归入「日常训练」。
              </p>
            </div>
          </Panel>
        </div>

        <Panel>
          <PanelHeader
            title="训练 Sessions"
            subtitle="训练上下文：当前训练决定新对局默认记入哪个 Session，删除前需先移走比赛"
            action={
              <Button size="sm" onClick={openCreate} disabled={busy}>
                <Plus size={13} /> 新建 Session
              </Button>
            }
          />
          {sessions && sessions.length > 0 ? (
            <div className="flex flex-col gap-2 p-4">
              {sessions.map((s) => {
                const owned = sessionCounts?.[s.id] ?? 0;
                return (
                  <div key={s.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-line bg-base-900/60 px-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm text-ink-50">{s.name}</span>
                        <Badge tone={s.type === "competition" ? "gold" : "muted"}>
                          {SESSION_TYPE_LABELS[s.type]}
                        </Badge>
                      </div>
                      <div className="mt-0.5 text-[11px] text-ink-600">
                        {s.startDate}
                        {s.endDate ? ` ~ ${s.endDate}` : " ~ 持续"}
                        {" · "}
                        {owned} 局
                      </div>
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => onSetActive(s.id)}>
                      设为当前
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => openEdit(s)}>
                      编辑
                    </Button>
                    <Button size="sm" variant={owned > 0 ? "ghost" : "danger"} onClick={() => requestDeleteSession(s)}>
                      <Trash2 size={12} />
                      删除
                    </Button>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState
              title="还没有训练 Session"
              description="系统首次运行会自动创建「日常训练」与默认竞赛 Session。"
            />
          )}
        </Panel>

        <Panel>
          <PanelHeader
            title="Set 18 静态数据"
            subtitle="棋子 / 羁绊 / 装备 / 强化符文 —— 随应用内置，离线可用"
            action={<Badge tone="muted">本地快照 · {tft.manifest.dataVersion}</Badge>}
          />
          <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4">
            <CountTile label="棋子" value={tft.champions.length} />
            <CountTile label="羁绊" value={tft.traits.length} />
            <CountTile label="装备" value={tft.items.length} />
            <CountTile label="强化符文" value={tft.augments.length} />
          </div>
          <p className="border-t border-line px-4 py-3 text-[11px] text-ink-600">
            {tft.manifest.name} · 补丁 {tft.manifest.version} · 来源 {tft.manifest.source.name} ·
            抓取于 {tft.manifest.source.retrievedAt}。对局里的规范 id 以这份数据为准，
            来源与分类规则见 <code className="mx-1">data/tft/set18/README.md</code>。
          </p>
        </Panel>

        <Panel>
          <PanelHeader
            title="示例数据"
            subtitle="虚构数据，用来浏览全部页面"
            action={
              <Badge tone="info">
                <Sparkles size={12} /> Demo · 非真实战绩
              </Badge>
            }
          />
          <div className="flex flex-wrap items-center gap-3 p-4">
            <Button variant="primary" onClick={onLoadDemo} disabled={busy}>
              <Sparkles size={15} />
              载入示例数据
            </Button>
            <Button onClick={onClearDemo} disabled={busy}>
              清除示例数据
            </Button>
            <span className="text-[11px] leading-relaxed text-ink-600">
              16 局虚构对局 + 决策 / 复盘 / 训练目标，日期自动对齐到今天；示例记录固定属于
              「日常训练」，id 以
              <code className="mx-1">demo-</code>
              开头，清除时不会影响你真实记录的数据。
            </span>
          </div>
        </Panel>

        <Panel>
          <PanelHeader title="危险区" subtitle="清掉本机全部训练数据" />
          <div className="flex flex-wrap items-center gap-3 p-4">
            <Button variant="danger" onClick={() => setConfirmWipe(true)} disabled={total === 0 || busy}>
              <Trash2 size={15} />
              清空所有数据
            </Button>
            <span className="text-[11px] text-ink-600">
              先 Export JSON 再清，才叫安全。
            </span>
          </div>
        </Panel>
      </div>

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === "new" ? "新建训练 Session" : "编辑训练 Session"}
        subtitle="Session = 一段有明确目标和统计口径的训练周期"
        footer={
          editing ? (
            <>
              <Button variant="primary" onClick={onSaveSession} disabled={busy}>
                保存
              </Button>
              <Button onClick={() => setEditing(null)}>取消</Button>
            </>
          ) : null
        }
      >
        <div className="flex flex-col gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="类型" htmlFor="session-type">
              <Select
                id="session-type"
                value={draft.type}
                onChange={(e) => setDraft((d) => ({ ...d, type: e.target.value as SessionType }))}
              >
                {SESSION_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {SESSION_TYPE_LABELS[t]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="名称" htmlFor="session-name" required>
              <Input
                id="session-name"
                value={draft.name}
                placeholder="例如：杯赛准备 / S19 冲榜"
                onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
              />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="开始日期" htmlFor="session-start" required>
              <Input
                id="session-start"
                type="date"
                value={draft.startDate}
                onChange={(e) => setDraft((d) => ({ ...d, startDate: e.target.value }))}
              />
            </Field>
            <Field label="结束日期（可选）" htmlFor="session-end">
              <Input
                id="session-end"
                type="date"
                value={draft.endDate}
                onChange={(e) => setDraft((d) => ({ ...d, endDate: e.target.value }))}
              />
            </Field>
          </div>
          <Field label="描述（可选）" htmlFor="session-desc">
            <Input
              id="session-desc"
              value={draft.description}
              placeholder="一句话说明这个训练周期"
              onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
            />
          </Field>
        </div>
      </Modal>

      <Modal
        open={confirmWipe}
        onClose={() => setConfirmWipe(false)}
        title="清空全部数据？"
        subtitle={`${total} 条记录将被删除，且无法恢复`}
        footer={
          <>
            <Button
              variant="danger"
              onClick={async () => {
                setBusy(true);
                try {
                  await wipeAll();
                  setConfirmWipe(false);
                  toast.push("全部数据已清空");
                } catch (err) {
                  toast.push(errorMessage(err), "warn");
                } finally {
                  setBusy(false);
                }
              }}
            >
              确认清空
            </Button>
            <Button onClick={() => setConfirmWipe(false)}>取消</Button>
          </>
        }
      >
        {total === 0 ? (
          <EmptyState title="当前没有可清空的数据" />
        ) : (
          <p className="text-sm text-ink-200">
            {counts.matches} 对局 · {counts.decisions} 决策 · {counts.reviews} 复盘 ·{" "}
            {counts.trainingGoals} 训练目标
          </p>
        )}
      </Modal>

      <Modal
        open={confirmDeleteId !== null}
        onClose={() => setConfirmDeleteId(null)}
        title="删除这个 Session？"
        subtitle="没有比赛的 Session 才可以删除"
        footer={
          <>
            <Button variant="danger" onClick={() => onConfirmDeleteSession(confirmDeleteId!)}>
              确认删除
            </Button>
            <Button onClick={() => setConfirmDeleteId(null)}>取消</Button>
          </>
        }
      >
        <p className="text-sm text-ink-200">
          {(sessions ?? []).find((s) => s.id === confirmDeleteId)?.name ?? confirmDeleteId}
        </p>
      </Modal>

      <Modal
        open={backupText !== null}
        onClose={() => setBackupText(null)}
        title="备份内容"
        subtitle="浏览器拒绝了复制，请长按全选下面的文本手动复制保存"
        footer={
          <Button variant="primary" onClick={() => setBackupText(null)}>
            关闭
          </Button>
        }
      >
        <textarea
          readOnly
          aria-label="备份 JSON 文本"
          value={backupText ?? ""}
          onFocus={(e) => e.target.select()}
          rows={10}
          className="w-full rounded-lg border border-line bg-base-900 p-3 text-[11px] leading-relaxed text-ink-200"
        />
      </Modal>
    </>
  );
}

function CountTile({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg border border-line bg-base-900/60 px-3 py-2.5">
      <div className="text-[11px] uppercase tracking-wide text-ink-600">{label}</div>
      <div className="num text-xl text-ink-50">{value}</div>
    </div>
  );
}
