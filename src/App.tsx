import { Check, Save } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { SetStateAction } from "react";
import { AppearancePage } from "./pages/appearance-page";
import { InputSettingsPage } from "./pages/input-settings-page";
import { LearningPage } from "./pages/learning-page";
import { getPageLabel, type PageId, settingsPages } from "./settings/page-registry";
import { type SettingsClient, tauriSettingsClient } from "./settings/settings-client";
import {
  type ClearLocalLearningResult,
  type OpenWenIMESettings,
  createDefaultSettings,
  normalizeSettings,
  settingsEqual,
  validateSettings
} from "./settings/settings-model";

type SaveState = "idle" | "saving" | "saved" | "failed";

const pageDescriptions: Record<PageId, string> = {
  input: "管理输入方案、候选行为与常用快捷键。",
  appearance: "调整候选窗的显示模式、背景与文字大小。",
  learning: "控制只保存在本机的个性化学习数据。"
};

/** 管理三页设置草稿、已保存快照、校验和持久化状态。 */
function App({ settingsClient = tauriSettingsClient }: { settingsClient?: SettingsClient }) {
  const [activePage, setActivePage] = useState<PageId>("input");
  const [savedSettings, setSavedSettings] = useState<OpenWenIMESettings | null>(null);
  const [draftSettings, setDraftSettings] = useState<OpenWenIMESettings | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");

  useEffect(() => {
    let active = true;
    void settingsClient.getSettings().then(
      (loaded) => {
        if (!active) return;
        const normalized = normalizeSettings(loaded);
        setSavedSettings(normalized);
        setDraftSettings(normalized);
      },
      () => {
        if (!active) return;
        const defaults = createDefaultSettings();
        setLoadFailed(true);
        setSavedSettings(defaults);
        setDraftSettings(defaults);
      }
    );
    return () => { active = false; };
  }, [settingsClient]);

  useEffect(() => {
    if (saveState !== "saved") return;
    const timer = window.setTimeout(() => setSaveState("idle"), 1800);
    return () => window.clearTimeout(timer);
  }, [saveState]);

  const errors = useMemo(
    () => draftSettings ? validateSettings(draftSettings) : {},
    [draftSettings]
  );
  const hasValidationErrors = Object.keys(errors).length > 0;
  const hasUnsavedChanges = Boolean(
    draftSettings && savedSettings && !settingsEqual(draftSettings, savedSettings)
  );
  const isSaving = saveState === "saving";

  /** 保存完整草稿；失败时保留未保存内容并只展示脱敏错误。 */
  async function save() {
    if (!draftSettings || !hasUnsavedChanges || hasValidationErrors || isSaving) return;
    setSaveState("saving");
    try {
      const saved = normalizeSettings(await settingsClient.saveSettings(draftSettings));
      setSavedSettings(saved);
      setDraftSettings(saved);
      setSaveState("saved");
    } catch {
      setSaveState("failed");
    }
  }

  /** 独立清除本机学习数据，不修改学习开关或自动保存普通设置。 */
  async function clearLocalLearning(): Promise<ClearLocalLearningResult> {
    try {
      const result = await settingsClient.clearLocalLearning();
      if (result.cleared) return { cleared: true, message: "本地学习数据已清除" };
    } catch {
      // Raw command errors never enter renderable state.
    }
    return { cleared: false, message: "本地学习数据清除失败" };
  }

  /** 替换当前草稿并清除已过期的保存反馈。 */
  function updateDraftSettings(next: SetStateAction<OpenWenIMESettings>) {
    setDraftSettings((current) => {
      if (!current) return current;
      return typeof next === "function" ? next(current) : next;
    });
  }

  const statusText = isSaving
    ? "正在保存设置"
    : saveState === "saved"
      ? "设置已保存"
      : saveState === "failed"
        ? "有未保存的修改"
        : hasUnsavedChanges
          ? "有未保存的修改"
          : "所有设置均已保存";

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand" aria-label="OpenWen 设置">
          <div className="brand-mark" aria-hidden="true">文</div>
          <div>
            <div className="brand-title">OpenWen</div>
            <div className="brand-subtitle">输入法设置</div>
          </div>
        </div>
        <nav className="nav-list" aria-label="设置页">
          {settingsPages.map((page) => {
            const Icon = page.icon;
            const active = page.id === activePage;
            return (
              <button
                aria-current={active ? "page" : undefined}
                className={active ? "nav-item active" : "nav-item"}
                key={page.id}
                onClick={() => setActivePage(page.id)}
                type="button"
              >
                <span className="nav-indicator" aria-hidden="true" />
                <Icon aria-hidden="true" size={18} />
                <span>{page.label}</span>
              </button>
            );
          })}
        </nav>
        <div className="sidebar-footer">
          <span className="local-dot" aria-hidden="true" />
          设置与学习数据仅保存在本机
        </div>
      </aside>

      <main className="content">
        <header className="content-header">
          <div className="title-block">
            <h1>{getPageLabel(activePage)}</h1>
            <p>{pageDescriptions[activePage]}</p>
          </div>
          <div className="save-area">
            <div aria-live="polite" className="save-status" role="status">
              {saveState === "saved" ? <Check aria-hidden="true" size={14} /> : null}
              {draftSettings ? statusText : "正在读取本机设置"}
            </div>
            <button
              aria-label={isSaving ? "正在保存" : "保存设置"}
              className="primary-button"
              disabled={!draftSettings || !hasUnsavedChanges || hasValidationErrors || isSaving}
              onClick={() => void save()}
              type="button"
            >
              <Save aria-hidden="true" size={16} />
              {isSaving ? "正在保存" : "保存"}
            </button>
          </div>
        </header>

        {loadFailed ? (
          <div className="notice error-notice" role="alert">无法读取本机设置，当前使用默认值。</div>
        ) : null}
        {saveState === "failed" ? (
          <div className="notice error-notice" role="alert">设置保存失败，请稍后重试。</div>
        ) : null}

        {!draftSettings ? (
          <div className="loading-panel" aria-hidden="true">
            <div className="loading-line wide" />
            <div className="loading-line" />
            <div className="loading-card" />
          </div>
        ) : (
          <fieldset className="page-fieldset" disabled={isSaving}>
            {activePage === "input" ? (
              <InputSettingsPage errors={errors} settings={draftSettings} setSettings={updateDraftSettings} />
            ) : null}
            {activePage === "appearance" ? (
              <AppearancePage errors={errors} settings={draftSettings} setSettings={updateDraftSettings} />
            ) : null}
            {activePage === "learning" ? (
              <LearningPage
                clearLocalLearning={clearLocalLearning}
                settings={draftSettings}
                setSettings={updateDraftSettings}
              />
            ) : null}
          </fieldset>
        )}
      </main>
    </div>
  );
}

export default App;
