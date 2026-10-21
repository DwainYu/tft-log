import { useEffect, useRef, useState, type ReactNode } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { ImagePlus, Trash2, Unlink, Upload, ZoomIn } from "lucide-react";
import {
  deleteScreenshot,
  getScreenshotBlob,
  listScreenshots,
  listUnattachedScreenshots,
  saveScreenshots,
} from "../../services/screenshot-service";
import { formatBytes, type ScreenshotCandidate, type ScreenshotMeta } from "../../domain/screenshot/screenshot";
import { errorMessage } from "../../lib/errors";
import { EmptyState } from "../ui/Badge";
import { Button } from "../ui/Button";
import { Modal } from "../ui/Modal";
import { Spinner } from "../ui/Spinner";
import { useToast } from "../ui/Toast";

/**
 * Thumbnail grid + large preview + delete / attach, in one self-contained panel
 * body. `matchId` selects the owning match; leaving it off renders the
 * unattached pool instead — same rows, different relationship to a match.
 *
 * Object URLs exist only while a card/preview is mounted and are revoked on
 * unmount: the bytes live in IndexedDB, never behind a `blob:` URL that would
 * die with the page.
 */
export function ScreenshotGallery({
  matchId,
  upload = false,
  acceptPaste = false,
  onAttach,
  onDetach,
  emptyTitle,
  emptyHint,
}: {
  /** Owning match; absent = the unattached pool. */
  matchId?: string;
  /** Show the file picker row. Off for the pool, which is fed by detaching. */
  upload?: boolean;
  /**
   * Bind Ctrl/Cmd+V to this gallery. Only ever pass `true` for one mounted
   * instance — two listeners would save the same paste twice.
   */
  acceptPaste?: boolean;
  onAttach?: (id: string) => Promise<void>;
  onDetach?: (id: string) => Promise<void>;
  emptyTitle: string;
  emptyHint: string;
}): ReactNode {
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const list = useLiveQuery(
    () => (matchId ? listScreenshots(matchId) : listUnattachedScreenshots()),
    [matchId],
  );

  const save = async (files: File[]) => {
    if (files.length === 0) return;
    setBusy(true);
    try {
      const result = await saveScreenshots(matchId, files.map(toCandidate));
      if (result.saved.length > 0) toast.push(`已保存 ${result.saved.length} 张截图`);
      for (const failure of result.failed) toast.push(`${failure.name}：${failure.reason}`, "warn");
      if (result.warning) toast.push(result.warning, "warn");
    } catch (err) {
      toast.push(errorMessage(err), "warn");
    } finally {
      setBusy(false);
    }
  };

  // Latest closure without re-binding the listener on every render.
  const saveRef = useRef(save);
  saveRef.current = save;
  useEffect(() => {
    if (!acceptPaste) return;
    function onPaste(e: ClipboardEvent) {
      // Pasting text into the notes field must not be hijacked.
      const target = e.target as HTMLElement | null;
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) {
        return;
      }
      const files = [...(e.clipboardData?.files ?? [])];
      if (files.length === 0) return;
      e.preventDefault();
      void saveRef.current(files);
    }
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [acceptPaste]);

  if (list === undefined) return <Spinner label="读取截图" />;

  const previewItem = preview ? list.find((s) => s.id === preview) : undefined;
  const confirmItem = confirmId ? list.find((s) => s.id === confirmId) : undefined;

  return (
    <>
      {upload && (
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif,image/bmp"
            multiple
            className="hidden"
            aria-label="选择结算截图"
            onChange={(e) => {
              const files = [...(e.target.files ?? [])];
              e.target.value = "";
              void save(files);
            }}
          />
          <Button variant="primary" size="sm" disabled={busy} onClick={() => fileRef.current?.click()}>
            <Upload size={13} />
            {busy ? "保存中…" : "选择图片"}
          </Button>
          {acceptPaste && (
            <span className="text-[11px] text-ink-600">
              也可以直接 <kbd className="num">Ctrl/⌘ + V</kbd> 粘贴截图
            </span>
          )}
        </div>
      )}

      {list.length === 0 ? (
        <EmptyState
          title={emptyTitle}
          description={emptyHint}
          action={
            upload ? (
              <Button size="sm" disabled={busy} onClick={() => fileRef.current?.click()}>
                <ImagePlus size={13} />
                选择图片
              </Button>
            ) : undefined
          }
        />
      ) : (
        <ul className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 lg:grid-cols-4">
          {list.map((item) => (
            <li key={item.id}>
              <ScreenshotCard item={item} onOpen={() => setPreview(item.id)} />
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={previewItem !== undefined}
        onClose={() => setPreview(null)}
        title={previewItem?.fileName ?? "截图"}
        subtitle={previewItem ? `${formatBytes(previewItem.byteSize)} · ${formatDateTime(previewItem.createdAt)}` : undefined}
        size="lg"
        footer={
          previewItem ? (
            <>
              {onAttach && (
                <Button
                  size="sm"
                  variant="primary"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      await onAttach(previewItem.id);
                      setPreview(null);
                    } catch (err) {
                      toast.push(errorMessage(err), "warn");
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  关联到本局
                </Button>
              )}
              {onDetach && (
                <Button
                  size="sm"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      await onDetach(previewItem.id);
                      setPreview(null);
                    } catch (err) {
                      toast.push(errorMessage(err), "warn");
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  <Unlink size={13} />
                  转为未关联
                </Button>
              )}
              <Button size="sm" variant="danger" disabled={busy} onClick={() => setConfirmId(previewItem.id)}>
                <Trash2 size={13} />
                删除
              </Button>
              <Button size="sm" onClick={() => setPreview(null)}>
                关闭
              </Button>
            </>
          ) : null
        }
      >
        {previewItem ? (
          <div className="flex flex-col gap-3">
            <PreviewImage id={previewItem.id} fileName={previewItem.fileName} />
            <dl className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
              <Meta label="文件" value={previewItem.fileName} />
              <Meta label="大小" value={formatBytes(previewItem.byteSize)} />
              <Meta label="保存时间" value={formatDateTime(previewItem.createdAt)} />
              <Meta
                label="尺寸"
                value={previewItem.width ? `${previewItem.width} × ${previewItem.height}` : undefined}
              />
            </dl>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={confirmItem !== undefined}
        onClose={() => setConfirmId(null)}
        title="删除这张截图？"
        subtitle="图片会连同备份一起从本机删除，不可撤销"
        footer={
          <>
            <Button
              variant="danger"
              disabled={busy}
              onClick={async () => {
                if (!confirmItem) return;
                setBusy(true);
                try {
                  await deleteScreenshot(confirmItem.id);
                  toast.push("截图已删除");
                  setConfirmId(null);
                  setPreview(null);
                } catch (err) {
                  toast.push(errorMessage(err), "warn");
                } finally {
                  setBusy(false);
                }
              }}
            >
              确认删除
            </Button>
            <Button onClick={() => setConfirmId(null)}>取消</Button>
          </>
        }
      >
        <p className="text-sm text-ink-200">
          {confirmItem?.fileName} · {formatBytes(confirmItem?.byteSize)}
        </p>
      </Modal>
    </>
  );
}

/** One grid cell. Loads its own bytes so the grid never carries every image at once. */
function ScreenshotCard({
  item,
  onOpen,
}: {
  item: ScreenshotMeta;
  onOpen: () => void;
}): ReactNode {
  const blob = useLiveQuery(async () => {
    try {
      return await getScreenshotBlob(item.id);
    } catch {
      // Deleted between the list read and this one — the row is going away.
      return null;
    }
  }, [item.id]);
  const url = useObjectUrl(blob ?? undefined);

  return (
    <button
      type="button"
      onClick={onOpen}
      title={`${item.fileName} · ${formatBytes(item.byteSize)}`}
      className="group relative block w-full overflow-hidden rounded-lg border border-line bg-base-900 p-0 text-left transition-colors hover:border-gold-500/45"
    >
      <span className="flex aspect-video items-center justify-center bg-base-950/60">
        {url ? (
          <img src={url} alt={item.fileName} className="max-h-full max-w-full object-contain" />
        ) : (
          <ZoomIn size={16} className="text-ink-600" />
        )}
      </span>
      <span className="block truncate border-t border-line px-2 py-1.5 text-[11px] text-ink-400">
        {item.fileName}
      </span>
      <span className="absolute right-1.5 top-1.5 rounded-md border border-line bg-base-850/90 px-1.5 py-0.5 text-[10px] text-ink-600 opacity-0 transition-opacity group-hover:opacity-100">
        {formatBytes(item.byteSize)}
      </span>
    </button>
  );
}

function PreviewImage({ id, fileName }: { id: string; fileName: string }): ReactNode {
  const blob = useLiveQuery(async () => {
    try {
      return await getScreenshotBlob(id);
    } catch {
      return null;
    }
  }, [id]);
  const url = useObjectUrl(blob ?? undefined);

  if (!url) {
    return (
      <div className="flex h-64 items-center justify-center rounded-lg border border-line bg-base-950/50 text-xs text-ink-600">
        图片加载失败
      </div>
    );
  }
  return (
    <img
      src={url}
      alt={fileName}
      className="mx-auto max-h-[60dvh] w-auto max-w-full rounded-lg border border-line object-contain"
    />
  );
}

/**
 * A `blob:` URL for exactly as long as the caller is mounted.
 *
 * This is a *preview handle*, not storage: the URL is invalid after a reload,
 * so nothing may persist it — re-opening a screenshot always goes back to
 * IndexedDB and minting a fresh one.
 */
function useObjectUrl(blob: Blob | undefined): string | undefined {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (!blob) {
      setUrl(undefined);
      return;
    }
    const next = URL.createObjectURL(blob);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [blob]);
  return url;
}

function Meta({ label, value }: { label: string; value?: string }): ReactNode {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] uppercase tracking-wide text-ink-600">{label}</dt>
      <dd className="truncate text-ink-200">{value ?? "—"}</dd>
    </div>
  );
}

function formatDateTime(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("zh-CN");
}

function toCandidate(file: File): ScreenshotCandidate {
  return { name: file.name, type: file.type, size: file.size, blob: file };
}

