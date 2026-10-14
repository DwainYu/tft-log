import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { ArrowRight, FileClock, Trash2 } from "lucide-react";
import { draftSummaries, deleteReviewDraft } from "../services/review-service";
import { useToast } from "../components/ui/Toast";
import { Badge, EmptyState } from "../components/ui/Badge";
import { Button, LinkButton } from "../components/ui/Button";
import { Modal } from "../components/ui/Modal";
import { PageHeader, Panel, PanelHeader } from "../components/ui/Panel";
import { Spinner } from "../components/ui/Spinner";
import { errorMessage } from "../lib/errors";
import { formatDateWeekday, formatTime } from "../lib/wallclock";

/**
 * The drafts box: every 复盘 that was started and not yet finished.
 *
 * Deliberately the *only* place drafts are listed. Matches already carrying a
 * finished 复盘 never appear here — `draftSummaries()` filters them out, and
 * completing a 复盘 deletes its draft, so the two lists cannot overlap.
 */
export function ReviewDraftsPage() {
  const toast = useToast();
  const drafts = useLiveQuery(draftSummaries, []);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (drafts === undefined) return <Spinner label="读取草稿箱" />;

  async function onDelete(matchId: string) {
    setConfirmId(null);
    setBusy(true);
    try {
      await deleteReviewDraft(matchId);
      toast.push("草稿已删除");
    } catch (err) {
      toast.push(errorMessage(err), "warn");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title="草稿箱"
        subtitle="写了但还没写完的复盘 —— 内容已经存在本机，随时回来接着写"
        action={<Badge tone="muted">{drafts.length} 份未完成</Badge>}
      />

      {drafts.length === 0 ? (
        <Panel>
          <EmptyState
            title="还没有未完成的复盘"
            description="打开任意一局开始写复盘，写到一半直接关掉也会自动存成草稿，之后从这里回来继续。"
            action={<LinkButton to="/matches" variant="primary">去对局列表</LinkButton>}
          />
        </Panel>
      ) : (
        <Panel>
          <PanelHeader
            title="未完成的复盘"
            subtitle="按对局时间从新到旧；删除只影响草稿，不动对局本身"
          />
          <ul className="flex flex-col divide-y divide-line">
            {drafts.map((d) => (
              <li
                key={d.matchId}
                className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3"
              >
                <FileClock size={16} className="shrink-0 text-ink-500" />
                <div className="min-w-0 flex-1">
                  <LinkButton
                    to={`/matches/${d.matchId}/review`}
                    size="sm"
                    variant="ghost"
                    className="!px-0 text-sm font-medium text-ink-100"
                  >
                    {d.matchLabel}
                  </LinkButton>
                  <p className="mt-0.5 text-[11px] text-ink-600">
                    {formatDateWeekday(d.playedAt)} {formatTime(d.playedAt)} · 必填 {d.filled}/
                    {d.total} 项
                  </p>
                </div>
                <Badge tone={d.filled === d.total ? "good" : "muted"}>
                  {d.filled === d.total ? "待保存" : `${d.total - d.filled} 项待补`}
                </Badge>
                <div className="flex items-center gap-2">
                  <LinkButton to={`/matches/${d.matchId}/review`} size="sm" variant="primary">
                    继续写
                    <ArrowRight size={13} />
                  </LinkButton>
                  <Button
                    size="sm"
                    variant="danger"
                    disabled={busy}
                    aria-label={`删除 ${d.matchLabel} 的草稿`}
                    onClick={() => setConfirmId(d.matchId)}
                  >
                    <Trash2 size={13} />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <Modal
        open={confirmId !== null}
        onClose={() => setConfirmId(null)}
        title="删除这份草稿？"
        footer={
          <>
            <Button onClick={() => setConfirmId(null)}>取消</Button>
            <Button variant="danger" disabled={busy} onClick={() => confirmId && void onDelete(confirmId)}>
              <Trash2 size={14} />
              删除草稿
            </Button>
          </>
        }
      >
        <p className="text-sm leading-relaxed text-ink-300">
          草稿里写了一半的内容会被清空，对局本身、已有的决策记录和已完成复盘都不受影响。
          这一步无法撤销。
        </p>
      </Modal>
    </>
  );
}
