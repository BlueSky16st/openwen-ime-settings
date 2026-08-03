import { Trash2 } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";
import { useRef, useState } from "react";
import { ConfirmationDialog } from "../components/confirmation-dialog";
import { SettingRow, SettingsSection, ToggleRow } from "../components/settings-controls";
import type { ClearLocalLearningResult, OpenWenIMESettings } from "../settings/settings-model";

type ClearState = "idle" | "confirming" | "clearing" | "cleared" | "failed";

/** 呈现本机学习开关、隐私说明和独立清除操作。 */
export function LearningPage({ settings, setSettings, clearLocalLearning }: {
  settings: OpenWenIMESettings;
  setSettings: Dispatch<SetStateAction<OpenWenIMESettings>>;
  clearLocalLearning: () => Promise<ClearLocalLearningResult>;
}) {
  const [clearState, setClearState] = useState<ClearState>("idle");
  const triggerRef = useRef<HTMLButtonElement>(null);

  /** 在非确认状态关闭对话框并恢复触发按钮焦点。 */
  function closeDialog() {
    setClearState("idle");
    window.setTimeout(() => triggerRef.current?.focus(), 0);
  }

  /** 防止重复提交并执行一次独立本机学习清除。 */
  async function confirmClear() {
    if (clearState === "clearing") return;
    setClearState("clearing");
    try {
      const result = await clearLocalLearning();
      setClearState(result.cleared ? "cleared" : "failed");
    } catch {
      setClearState("failed");
    }
    window.setTimeout(() => triggerRef.current?.focus(), 0);
  }

  const dialogOpen = clearState === "confirming" || clearState === "clearing";

  return (
    <div className="page-stack">
      <SettingsSection title="个性化学习" description="让候选排序逐渐适应你的使用习惯。">
        <ToggleRow
          ariaLabel="个性化学习"
          checked={settings.localLearning.enabled}
          description="根据本机上的选择调整候选排序和个人词条。"
          title="启用个性化学习"
          onChange={(enabled) => setSettings((current) => ({
            ...current,
            localLearning: { enabled }
          }))}
        />
        <div className="privacy-note">
          <p>学习数据仅保存在本机，不会上传或同步。</p>
          <p>关闭不会删除已有数据，再次开启后可以继续使用。</p>
        </div>
      </SettingsSection>

      <SettingsSection title="危险操作" description="清除后无法恢复，请谨慎操作。">
        <SettingRow title="清除本地学习数据" description="删除本机候选排序与个人词条，不改变学习开关。">
          <button
            className="destructive-outline-button"
            onClick={() => setClearState("confirming")}
            ref={triggerRef}
            type="button"
          >
            <Trash2 aria-hidden="true" size={16} />
            清除本地学习数据
          </button>
        </SettingRow>
      </SettingsSection>

      {clearState === "cleared" ? <p className="operation-status" role="status">本地学习数据已清除</p> : null}
      {clearState === "failed" ? <p className="operation-status error" role="alert">本地学习数据清除失败，请稍后重试</p> : null}
      {dialogOpen ? (
        <ConfirmationDialog
          busy={clearState === "clearing"}
          onCancel={closeDialog}
          onConfirm={() => void confirmClear()}
        />
      ) : null}
    </div>
  );
}
