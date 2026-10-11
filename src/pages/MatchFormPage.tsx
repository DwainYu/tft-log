import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { ChevronLeft } from "lucide-react";
import { deleteMatch, getMatch } from "../services/match-service";
import { placementText } from "../domain/match/match";
import { useQuickAdd } from "../components/matches/QuickAddProvider";
import { MatchForm } from "../components/matches/MatchForm";
import { Button } from "../components/ui/Button";
import { PageHeader } from "../components/ui/Panel";
import { Modal } from "../components/ui/Modal";
import { EmptyState } from "../components/ui/Badge";
import { Spinner } from "../components/ui/Spinner";
import { useToast } from "../components/ui/Toast";
import { errorMessage } from "../lib/errors";

export function MatchFormPage({ mode }: { mode: "create" | "edit" }) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const { openQuickAdd } = useQuickAdd();
  // `undefined` = still reading, `null` = not found / create mode.
  const found = useLiveQuery(
    async () => (mode === "edit" && id ? ((await getMatch(id)) ?? null) : null),
    [id],
  );
  const [confirmDelete, setConfirmDelete] = useState(false);

  const title = mode === "create" ? "新增对局" : "编辑对局";

  return (
    <>
      <PageHeader
        title={title}
        subtitle="完整记录：基础信息 / 对局状态 / 阵容装备"
        action={
          <>
            <Button variant="ghost" onClick={openQuickAdd}>
              改用快速记录
            </Button>
            {mode === "create" && (
              <Link
                to="/matches"
                className="text-xs text-ink-600 underline-offset-4 hover:text-ink-200 hover:underline"
              >
                返回对局列表
              </Link>
            )}
          </>
        }
      />

      {found === undefined ? (
        <Spinner label="读取对局" />
      ) : mode === "edit" && found === null ? (
        <div className="panel">
          <EmptyState
            title="找不到这局对局"
            description="它可能已经被删除了。"
            action={
              <Button onClick={() => navigate("/matches")}>返回对局列表</Button>
            }
          />
        </div>
      ) : (
        <MatchForm
          mode={mode}
          match={found ?? undefined}
          onDelete={found ? () => setConfirmDelete(true) : undefined}
        />
      )}

      {found && (
        <div className="mt-4">
          <Button variant="ghost" onClick={() => navigate(`/matches/${found.id}`)}>
            <ChevronLeft size={14} />
            放弃修改并返回详情
          </Button>
        </div>
      )}

      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="删除这局对局？"
        subtitle="决策记录和复盘会一起删除，此操作不可撤销"
        footer={
          <>
            <Button
              variant="danger"
              onClick={async () => {
                try {
                  await deleteMatch(found!.id);
                  navigate("/matches");
                } catch (err) {
                  toast.push(errorMessage(err), "warn");
                }
              }}
            >
              确认删除
            </Button>
            <Button onClick={() => setConfirmDelete(false)}>取消</Button>
          </>
        }
      >
        <p className="text-sm text-ink-200">
          {found
            ? `${placementText(found.placement)} · ${found.playedAt.slice(0, 10)} · ${found.composition ?? "未填阵容"}`
            : ""}
        </p>
      </Modal>
    </>
  );
}
