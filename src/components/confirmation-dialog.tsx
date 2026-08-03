import { AlertTriangle } from "lucide-react";
import { useEffect, useRef } from "react";

/** 呈现可访问的危险操作确认对话框，并在关闭后恢复触发按钮焦点。 */
export function ConfirmationDialog({
  busy,
  onCancel,
  onConfirm
}: {
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  /** 循环 Tab 焦点并允许 Escape 取消，确认中禁止重复操作。 */
  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape" && !busy) {
      event.preventDefault();
      onCancel();
      return;
    }
    if (event.key !== "Tab") return;

    const focusable = Array.from(
      dialogRef.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? []
    );
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <div className="dialog-backdrop">
      <div
        aria-describedby="clear-learning-description"
        aria-labelledby="clear-learning-title"
        aria-modal="true"
        className="dialog"
        onKeyDown={handleKeyDown}
        ref={dialogRef}
        role="dialog"
      >
        <div className="dialog-icon"><AlertTriangle aria-hidden="true" size={22} /></div>
        <h2 id="clear-learning-title">清除本地学习数据</h2>
        <p id="clear-learning-description">
          这会删除本机积累的候选排序与个人词条，操作无法撤销。
        </p>
        <div className="dialog-actions">
          <button disabled={busy} onClick={onCancel} ref={cancelRef} type="button">取消</button>
          <button className="danger-button" disabled={busy} onClick={onConfirm} type="button">
            {busy ? "正在清除" : "确认清除"}
          </button>
        </div>
      </div>
    </div>
  );
}
