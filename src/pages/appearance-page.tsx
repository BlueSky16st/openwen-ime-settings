import type { Dispatch, SetStateAction } from "react";
import { CandidatePreview } from "../components/candidate-preview";
import { FieldError, SettingRow, SettingsSection } from "../components/settings-controls";
import type { OpenWenIMESettings, SettingsValidationErrors } from "../settings/settings-model";

/** 呈现候选窗实时预览、主题、颜色和字号设置。 */
export function AppearancePage({ settings, setSettings, errors }: {
  settings: OpenWenIMESettings;
  setSettings: Dispatch<SetStateAction<OpenWenIMESettings>>;
  errors: SettingsValidationErrors;
}) {
  /** 仅更新外观草稿；真实候选窗在用户保存后才读取。 */
  const updateAppearance = (patch: Partial<OpenWenIMESettings["appearance"]>) => {
    setSettings((current) => ({
      ...current,
      appearance: { ...current.appearance, ...patch }
    }));
  };
  const colorPickerValue = /^#[0-9A-Fa-f]{6}$/.test(settings.appearance.candidateWindowColor)
    ? settings.appearance.candidateWindowColor
    : "#FFFFFF";

  return (
    <div className="page-stack appearance-layout">
      <CandidatePreview appearance={settings.appearance} />
      <SettingsSection title="显示模式" description="选择候选窗的明暗风格。">
        <SettingRow title="候选窗主题" description="主题只影响候选窗，不改变系统外观。">
          <div className="segmented" role="group" aria-label="候选窗主题">
            {(["light", "dark"] as const).map((theme) => (
              <button
                aria-pressed={settings.appearance.theme === theme}
                className={settings.appearance.theme === theme ? "active" : ""}
                key={theme}
                onClick={() => updateAppearance({ theme })}
                type="button"
              >
                {theme === "light" ? "浅色" : "深色"}
              </button>
            ))}
          </div>
        </SettingRow>
      </SettingsSection>
      <SettingsSection title="候选窗样式" description="调整候选窗背景和文字大小。">
        <SettingRow title="背景颜色" description="可使用颜色选择器或输入十六进制颜色值。" stacked>
          <div className="color-controls">
            <input
              aria-label="候选窗颜色选择器"
              type="color"
              value={colorPickerValue}
              onChange={(event) => updateAppearance({ candidateWindowColor: event.target.value.toUpperCase() })}
            />
            <input
              aria-describedby={errors.candidateWindowColor ? "color-error" : undefined}
              aria-invalid={Boolean(errors.candidateWindowColor)}
              aria-label="候选窗颜色文本值"
              className="color-text-input"
              spellCheck={false}
              value={settings.appearance.candidateWindowColor}
              onChange={(event) => updateAppearance({ candidateWindowColor: event.target.value })}
            />
          </div>
          <FieldError id="color-error" message={errors.candidateWindowColor} />
        </SettingRow>
        <SettingRow title="候选文字大小" description="在 12–28 像素之间调整。">
          <div className="range-control">
            <input
              aria-label="候选文字大小"
              max={28}
              min={12}
              type="range"
              value={settings.appearance.candidateTextSize}
              onChange={(event) => updateAppearance({ candidateTextSize: Number(event.target.value) })}
            />
            <output>{settings.appearance.candidateTextSize} px</output>
          </div>
        </SettingRow>
      </SettingsSection>
    </div>
  );
}
