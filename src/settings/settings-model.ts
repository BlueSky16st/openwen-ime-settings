export type InputMode = "simplifiedPinyin" | "ziranmaDoublePinyin" | "wubi86";

/** 标识当前公开设置 JSON 契约版本，不写入用户设置。 */
export const SETTINGS_CONTRACT_VERSION = 1;
export type ThemeMode = "light" | "dark";
export type NoCandidateSpaceAction = "clearComposition" | "commitRawCode";

export interface InputSettings {
  defaultInputMode: InputMode;
  candidateCount: number;
  pagePreviousKey: string;
  pageNextKey: string;
  startupChineseMode: boolean;
  startupFullWidth: boolean;
  startupChinesePunctuation: boolean;
  shortShiftTogglesChinese: boolean;
  capsLockSwitchesEnglish: boolean;
  enterCommitsRawCode: boolean;
  noCandidateSpaceAction: NoCandidateSpaceAction;
}

export interface AppearanceSettings {
  theme: ThemeMode;
  candidateWindowColor: string;
  candidateTextSize: number;
}

export interface LocalLearningSettings {
  enabled: boolean;
}

export interface OpenWenIMESettings {
  input: InputSettings;
  appearance: AppearanceSettings;
  localLearning: LocalLearningSettings;
}

export interface DiagnosticsState {
  engineState: string;
  currentSchema: string;
  coreP50Us: number;
  coreP95Us: number;
  startupMs: number;
  recentError: string | null;
}

type RawDiagnosticsState = Partial<DiagnosticsState> & {
  coreP50Ms?: number;
  coreP95Ms?: number;
};

export interface ClearLocalLearningResult {
  cleared: boolean;
  message: string;
}

export type SettingsValidationErrors = Partial<
  Record<"pagePreviousKey" | "pageNextKey" | "candidateWindowColor", string>
>;

const HEX_COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/;

/** 创建与 Rust、Swift 契约一致的完整默认设置。 */
export function createDefaultSettings(): OpenWenIMESettings {
  return {
    input: {
      defaultInputMode: "simplifiedPinyin",
      candidateCount: 5,
      pagePreviousKey: "-",
      pageNextKey: "=",
      startupChineseMode: true,
      startupFullWidth: false,
      startupChinesePunctuation: true,
      shortShiftTogglesChinese: true,
      capsLockSwitchesEnglish: false,
      enterCommitsRawCode: true,
      noCandidateSpaceAction: "clearComposition"
    },
    appearance: {
      theme: "light",
      candidateWindowColor: "#FFFFFF",
      candidateTextSize: 18
    },
    localLearning: {
      enabled: true
    }
  };
}

/** 归一化非法或缺失字段，同时保留范围内的历史合法值。 */
export function normalizeSettings(settings: OpenWenIMESettings): OpenWenIMESettings {
  const defaultSettings = createDefaultSettings();
  const candidateCount = settings.input.candidateCount;
  const candidateTextSize = settings.appearance.candidateTextSize;
  const pageKeysAreValid =
    isValidPageKey(settings.input.pagePreviousKey) &&
    isValidPageKey(settings.input.pageNextKey) &&
    settings.input.pagePreviousKey !== settings.input.pageNextKey;

  return {
    input: {
      ...settings.input,
      defaultInputMode: normalizeInputMode(settings.input.defaultInputMode),
      candidateCount: candidateCount >= 3 && candidateCount <= 9 ? candidateCount : 5,
      pagePreviousKey: pageKeysAreValid
        ? settings.input.pagePreviousKey
        : defaultSettings.input.pagePreviousKey,
      pageNextKey: pageKeysAreValid
        ? settings.input.pageNextKey
        : defaultSettings.input.pageNextKey,
      noCandidateSpaceAction: normalizeNoCandidateSpaceAction(
        settings.input.noCandidateSpaceAction
      )
    },
    appearance: {
      ...settings.appearance,
      theme: settings.appearance.theme === "dark" ? "dark" : "light",
      candidateWindowColor: normalizeCandidateWindowColor(settings.appearance.candidateWindowColor),
      candidateTextSize:
        candidateTextSize >= 12 && candidateTextSize <= 28
          ? candidateTextSize
          : defaultSettings.appearance.candidateTextSize
    },
    localLearning: {
      enabled: Boolean(settings.localLearning.enabled)
    }
  };
}

/** 判断翻页键是否为单个非空格可打印 ASCII 字符。 */
export function isValidPageKey(value: string): boolean {
  return value.length === 1 && value.charCodeAt(0) >= 33 && value.charCodeAt(0) <= 126;
}

/** 返回阻止保存的翻页键与颜色字段错误。 */
export function validateSettings(settings: OpenWenIMESettings): SettingsValidationErrors {
  const errors: SettingsValidationErrors = {};
  const keysAreValid =
    isValidPageKey(settings.input.pagePreviousKey) &&
    isValidPageKey(settings.input.pageNextKey) &&
    settings.input.pagePreviousKey !== settings.input.pageNextKey;

  if (!keysAreValid) {
    const message = "翻页键必须是两个不同的单个可打印 ASCII 字符";
    errors.pagePreviousKey = message;
    errors.pageNextKey = message;
  }
  if (!HEX_COLOR_PATTERN.test(settings.appearance.candidateWindowColor)) {
    errors.candidateWindowColor = "请输入 #RRGGBB 格式的颜色值";
  }

  return errors;
}

/** 比较归一化后的完整设置，派生是否存在未保存更改。 */
export function settingsEqual(left: OpenWenIMESettings, right: OpenWenIMESettings): boolean {
  return JSON.stringify(normalizeSettings(left)) === JSON.stringify(normalizeSettings(right));
}

/** 创建不含输入内容的诊断默认快照。 */
export function createDefaultDiagnostics(): DiagnosticsState {
  return {
    engineState: "unavailable",
    currentSchema: "simplifiedPinyin",
    coreP50Us: 0,
    coreP95Us: 0,
    startupMs: 0,
    recentError: null
  };
}

/** 将诊断输入限制为允许状态、官方方案、非负耗时和固定错误码。 */
export function normalizeDiagnosticsState(diagnostics: RawDiagnosticsState): DiagnosticsState {
  return {
    engineState: normalizeEngineState(diagnostics.engineState ?? ""),
    currentSchema: normalizeInputMode(diagnostics.currentSchema ?? ""),
    coreP50Us: normalizeDiagnosticDuration(
      diagnostics.coreP50Us ?? millisecondsToMicroseconds(diagnostics.coreP50Ms)
    ),
    coreP95Us: normalizeDiagnosticDuration(
      diagnostics.coreP95Us ?? millisecondsToMicroseconds(diagnostics.coreP95Ms)
    ),
    startupMs: normalizeDiagnosticDuration(diagnostics.startupMs),
    recentError: normalizeRecentError(diagnostics.recentError ?? null)
  };
}

/** 将微秒耗时格式化为用户可读文本。 */
export function formatLatencyUs(durationUs: number): string {
  const normalizedUs = normalizeDiagnosticDuration(durationUs);

  if (normalizedUs === 0) {
    return "0 ms";
  }

  const durationMs = normalizedUs / 1_000;
  if (durationMs < 10) {
    return `${durationMs.toFixed(2)} ms`;
  }
  if (durationMs < 100) {
    return `${durationMs.toFixed(1)} ms`;
  }
  return `${Math.round(durationMs)} ms`;
}

/** 将未知方案回退为简体拼音。 */
function normalizeInputMode(inputMode: string): InputMode {
  if (
    inputMode === "simplifiedPinyin" ||
    inputMode === "ziranmaDoublePinyin" ||
    inputMode === "wubi86"
  ) {
    return inputMode;
  }

  return "simplifiedPinyin";
}

/** 将未知空格行为回退为取消组合。 */
function normalizeNoCandidateSpaceAction(
  noCandidateSpaceAction: string
): NoCandidateSpaceAction {
  return noCandidateSpaceAction === "commitRawCode" ? "commitRawCode" : "clearComposition";
}

/** 规范 `#RRGGBB` 颜色，非法值回退为白色。 */
function normalizeCandidateWindowColor(candidateWindowColor: string): string {
  return HEX_COLOR_PATTERN.test(candidateWindowColor) ? candidateWindowColor : "#FFFFFF";
}

/** 将引擎状态限制为诊断白名单。 */
function normalizeEngineState(engineState: string): string {
  return ["ready", "unavailable", "error", "initializing"].includes(engineState)
    ? engineState
    : "unavailable";
}

/** 将诊断耗时限制为非负有限整数。 */
function normalizeDiagnosticDuration(duration: number | undefined): number {
  return typeof duration === "number" && Number.isFinite(duration) && duration >= 0
    ? Math.floor(duration)
    : 0;
}

/** 将历史毫秒字段转换为微秒。 */
function millisecondsToMicroseconds(durationMs: number | undefined): number {
  return typeof durationMs === "number" ? durationMs * 1_000 : 0;
}

/** 仅保留固定格式的短错误码。 */
function normalizeRecentError(recentError: string | null): string | null {
  if (recentError === null) {
    return null;
  }

  const trimmed = recentError.trim();
  if (trimmed.length === 0) {
    return null;
  }

  return /^[a-z0-9-]{1,64}$/.test(trimmed) ? trimmed : "diagnostics-error";
}
