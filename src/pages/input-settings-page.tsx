import type { Dispatch, SetStateAction } from "react";
import {
  FieldError,
  SettingRow,
  SettingsSection,
  Stepper,
  ToggleRow
} from "../components/settings-controls";
import type { OpenWenIMESettings, SettingsValidationErrors } from "../settings/settings-model";

const inputModeLabels: Record<OpenWenIMESettings["input"]["defaultInputMode"], string> = {
  simplifiedPinyin: "简体拼音",
  ziranmaDoublePinyin: "自然码双拼",
  wubi86: "五笔86"
};

const inputModeDescriptions: Record<OpenWenIMESettings["input"]["defaultInputMode"], string> = {
  simplifiedPinyin: "适合大多数用户，使用完整拼音输入。",
  ziranmaDoublePinyin: "使用自然码双拼键位，以更少按键完成拼音输入。",
  wubi86: "使用五笔 86 版字根与编码规则。"
};

/** 呈现输入方案、候选翻页、启动状态和快捷键四组设置。 */
export function InputSettingsPage({
  settings,
  setSettings,
  errors
}: {
  settings: OpenWenIMESettings;
  setSettings: Dispatch<SetStateAction<OpenWenIMESettings>>;
  errors: SettingsValidationErrors;
}) {
  /** 合并单个输入字段到完整设置草稿。 */
  const updateInput = (patch: Partial<OpenWenIMESettings["input"]>) => {
    setSettings((current) => ({ ...current, input: { ...current.input, ...patch } }));
  };

  return (
    <div className="page-stack">
      <SettingsSection title="输入方案" description="选择最适合你的中文输入方式。">
        <SettingRow title="默认输入方案" description={inputModeDescriptions[settings.input.defaultInputMode]}>
          <select
            aria-label="默认输入方案"
            value={settings.input.defaultInputMode}
            onChange={(event) => updateInput({
              defaultInputMode: event.target.value as OpenWenIMESettings["input"]["defaultInputMode"]
            })}
          >
            {Object.entries(inputModeLabels).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </SettingRow>
      </SettingsSection>

      <SettingsSection title="候选与翻页" description="调整候选列表的密度和翻页按键。">
        <SettingRow title="候选数量" description="每页显示 3–9 个候选。">
          <Stepper
            label="候选数量"
            max={9}
            min={3}
            value={settings.input.candidateCount}
            onChange={(candidateCount) => updateInput({ candidateCount })}
          />
        </SettingRow>
        <SettingRow title="翻页键" description="输入两个不同的单个可打印 ASCII 字符。" stacked>
          <div className="key-fields">
            <label>
              <span>上一页</span>
              <input
                aria-describedby={errors.pagePreviousKey ? "page-key-error" : undefined}
                aria-invalid={Boolean(errors.pagePreviousKey)}
                aria-label="上一页翻页键"
                maxLength={1}
                value={settings.input.pagePreviousKey}
                onChange={(event) => updateInput({ pagePreviousKey: event.target.value })}
              />
            </label>
            <label>
              <span>下一页</span>
              <input
                aria-describedby={errors.pageNextKey ? "page-key-error" : undefined}
                aria-invalid={Boolean(errors.pageNextKey)}
                aria-label="下一页翻页键"
                maxLength={1}
                value={settings.input.pageNextKey}
                onChange={(event) => updateInput({ pageNextKey: event.target.value })}
              />
            </label>
          </div>
          <FieldError id="page-key-error" message={errors.pagePreviousKey} />
        </SettingRow>
        <SettingRow title="无候选时按空格" description="决定当前编码没有候选时的收尾方式。">
          <select
            aria-label="无候选时按空格"
            value={settings.input.noCandidateSpaceAction}
            onChange={(event) => updateInput({
              noCandidateSpaceAction: event.target.value as OpenWenIMESettings["input"]["noCandidateSpaceAction"]
            })}
          >
            <option value="clearComposition">清空当前编码</option>
            <option value="commitRawCode">提交原始编码</option>
          </select>
        </SettingRow>
      </SettingsSection>

      <SettingsSection title="默认输入状态" description="设置每次启用输入法时的初始状态。">
        <ToggleRow
          checked={settings.input.startupChineseMode}
          description="启用输入法时直接进入中文输入。"
          title="启动中文模式"
          onChange={(startupChineseMode) => updateInput({ startupChineseMode })}
        />
        <ToggleRow
          checked={settings.input.startupFullWidth}
          description="启用输入法时使用全角字符。"
          title="启动全角"
          onChange={(startupFullWidth) => updateInput({ startupFullWidth })}
        />
        <ToggleRow
          checked={settings.input.startupChinesePunctuation}
          description="启用输入法时使用中文标点。"
          title="启动中文标点"
          onChange={(startupChinesePunctuation) => updateInput({ startupChinesePunctuation })}
        />
      </SettingsSection>

      <SettingsSection title="快捷键" description="控制常用按键在输入过程中的行为。">
        <ToggleRow
          checked={settings.input.shortShiftTogglesChinese}
          description="短按 Shift 在中文和英文模式间切换。"
          title="短按 Shift 切换中英"
          onChange={(shortShiftTogglesChinese) => updateInput({ shortShiftTogglesChinese })}
        />
        <ToggleRow
          checked={settings.input.capsLockSwitchesEnglish}
          description="按 Caps Lock 切换到英文输入模式。"
          title="Caps Lock 切换英文模式"
          onChange={(capsLockSwitchesEnglish) => updateInput({ capsLockSwitchesEnglish })}
        />
        <ToggleRow
          checked={settings.input.enterCommitsRawCode}
          description="组合输入时按 Enter 提交字母编码；关闭后按 Enter 取消当前编码。"
          title="Enter 提交原始编码"
          onChange={(enterCommitsRawCode) => updateInput({ enterCommitsRawCode })}
        />
      </SettingsSection>
    </div>
  );
}
