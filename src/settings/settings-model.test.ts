import { describe, expect, it } from "vitest";
import {
  SETTINGS_CONTRACT_VERSION,
  createDefaultSettings,
  formatLatencyUs,
  isValidPageKey,
  normalizeDiagnosticsState,
  normalizeSettings,
  settingsEqual,
  validateSettings
} from "./settings-model";
import type { DiagnosticsState, InputMode, NoCandidateSpaceAction } from "./settings-model";

describe("OpenWen Settings 设置模型", () => {
  it("公开契约版本保持为 1 且不写入用户设置 JSON", () => {
    expect(SETTINGS_CONTRACT_VERSION).toBe(1);
    expect(JSON.stringify(createDefaultSettings())).not.toContain("settingsContractVersion");
  });

  it("使用 PRD 规定的默认输入设置", () => {
    const settings = createDefaultSettings();

    expect(settings.input.defaultInputMode).toBe("simplifiedPinyin");
    expect(settings.input.candidateCount).toBe(5);
    expect(settings.input.pagePreviousKey).toBe("-");
    expect(settings.input.pageNextKey).toBe("=");
    expect(settings.input.startupChineseMode).toBe(true);
    expect(settings.input.startupFullWidth).toBe(false);
    expect(settings.input.startupChinesePunctuation).toBe(true);
    expect(settings.input.shortShiftTogglesChinese).toBe(true);
    expect(settings.input.capsLockSwitchesEnglish).toBe(false);
    expect(settings.input.enterCommitsRawCode).toBe(true);
    expect(settings.input.noCandidateSpaceAction).toBe("clearComposition");
    expect(settings.localLearning.enabled).toBe(true);
  });

  it("使用 PRD 规定的默认外观设置", () => {
    const settings = createDefaultSettings();

    expect(settings.appearance.theme).toBe("light");
    expect(settings.appearance.candidateWindowColor).toBe("#FFFFFF");
    expect(settings.appearance.candidateTextSize).toBe(18);
  });

  it("候选数量超出 3 到 9 时回退为 5", () => {
    const settings = createDefaultSettings();
    const normalizedHigh = normalizeSettings({
      ...settings,
      input: {
        ...settings.input,
        candidateCount: 10
      }
    });
    const normalizedLow = normalizeSettings({
      ...settings,
      input: {
        ...settings.input,
        candidateCount: 2
      }
    });

    expect(normalizedHigh.input.candidateCount).toBe(5);
    expect(normalizedLow.input.candidateCount).toBe(5);
  });

  it("保留候选数量、官方输入方案和字号的合法边界值", () => {
    const settings = createDefaultSettings();
    const inputModes: InputMode[] = ["simplifiedPinyin", "ziranmaDoublePinyin", "wubi86"];

    expect(
      normalizeSettings({
        ...settings,
        input: { ...settings.input, candidateCount: 3 },
        appearance: { ...settings.appearance, candidateTextSize: 12 }
      }).input.candidateCount
    ).toBe(3);
    expect(
      normalizeSettings({
        ...settings,
        input: { ...settings.input, candidateCount: 9 },
        appearance: { ...settings.appearance, candidateTextSize: 28 }
      }).appearance.candidateTextSize
    ).toBe(28);

    for (const inputMode of inputModes) {
      expect(
        normalizeSettings({
          ...settings,
          input: {
            ...settings.input,
            defaultInputMode: inputMode
          }
        }).input.defaultInputMode
      ).toBe(inputMode);
    }
  });

  it("非法、非 ASCII 或重复翻页键整对回退为默认口径", () => {
    const settings = createDefaultSettings();
    const normalized = normalizeSettings({
      ...settings,
      input: {
        ...settings.input,
        defaultInputMode: "unknown" as typeof settings.input.defaultInputMode,
        pagePreviousKey: "",
        pageNextKey: ""
      }
    });

    expect(normalized.input.defaultInputMode).toBe("simplifiedPinyin");
    expect(normalized.input.pagePreviousKey).toBe("-");
    expect(normalized.input.pageNextKey).toBe("=");

    for (const [pagePreviousKey, pageNextKey] of [["中", "="], [" ", "="], ["[", "["]]) {
      const invalidPair = normalizeSettings({
        ...settings,
        input: { ...settings.input, pagePreviousKey, pageNextKey }
      });
      expect(invalidPair.input.pagePreviousKey).toBe("-");
      expect(invalidPair.input.pageNextKey).toBe("=");
    }
  });

  it("翻页键校验只接受单个非空格可打印 ASCII 字符", () => {
    expect(isValidPageKey("!")).toBe(true);
    expect(isValidPageKey("~")).toBe(true);
    expect(isValidPageKey(" ")).toBe(false);
    expect(isValidPageKey("中")).toBe(false);
    expect(isValidPageKey("ab")).toBe(false);
  });

  it("设置校验按固定字段返回错误并支持归一化等价比较", () => {
    const settings = createDefaultSettings();
    const invalid = {
      ...settings,
      input: { ...settings.input, pagePreviousKey: "[", pageNextKey: "[" },
      appearance: { ...settings.appearance, candidateWindowColor: "#fff" }
    };

    expect(validateSettings(invalid)).toEqual({
      pagePreviousKey: "翻页键必须是两个不同的单个可打印 ASCII 字符",
      pageNextKey: "翻页键必须是两个不同的单个可打印 ASCII 字符",
      candidateWindowColor: "请输入 #RRGGBB 格式的颜色值"
    });
    expect(settingsEqual(settings, { ...settings })).toBe(true);
    expect(
      settingsEqual(settings, {
        ...settings,
        input: { ...settings.input, candidateCount: 6 }
      })
    ).toBe(false);
  });

  it("非法无候选空格动作回退为清空输入", () => {
    const settings = createDefaultSettings();
    const normalized = normalizeSettings({
      ...settings,
      input: {
        ...settings.input,
        noCandidateSpaceAction: "unknown" as NoCandidateSpaceAction
      }
    });

    expect(normalized.input.noCandidateSpaceAction).toBe("clearComposition");
  });

  it("保留合法无候选空格动作", () => {
    const settings = createDefaultSettings();

    expect(
      normalizeSettings({
        ...settings,
        input: {
          ...settings.input,
          noCandidateSpaceAction: "commitRawCode"
        }
      }).input.noCandidateSpaceAction
    ).toBe("commitRawCode");
  });

  it("非法外观参数回退为默认口径", () => {
    const settings = createDefaultSettings();
    const invalidColors = ["", "not-a-color", "#FFF", "113355"];

    for (const candidateWindowColor of invalidColors) {
      const normalized = normalizeSettings({
        ...settings,
        appearance: {
          ...settings.appearance,
          theme: "system" as typeof settings.appearance.theme,
          candidateWindowColor,
          candidateTextSize: 40
        }
      });

      expect(normalized.appearance.theme).toBe("light");
      expect(normalized.appearance.candidateWindowColor).toBe("#FFFFFF");
      expect(normalized.appearance.candidateTextSize).toBe(18);
    }
  });

  it("保留合法外观参数", () => {
    const settings = createDefaultSettings();
    const normalized = normalizeSettings({
      ...settings,
      appearance: {
        ...settings.appearance,
        theme: "dark",
        candidateWindowColor: "#113355",
        candidateTextSize: 12
      }
    });

    expect(normalized.appearance.theme).toBe("dark");
    expect(normalized.appearance.candidateWindowColor).toBe("#113355");
    expect(normalized.appearance.candidateTextSize).toBe(12);
  });

  it("保留历史合法字号 17，不迁移或覆盖", () => {
    const settings = createDefaultSettings();
    const normalized = normalizeSettings({
      ...settings,
      appearance: { ...settings.appearance, candidateTextSize: 17 }
    });

    expect(normalized.appearance.candidateTextSize).toBe(17);
  });

  it("设置模型序列化为 camelCase 字段", () => {
    const raw = JSON.stringify(createDefaultSettings());

    expect(raw).toContain("defaultInputMode");
    expect(raw).toContain("noCandidateSpaceAction");
    expect(raw).toContain("candidateWindowColor");
    expect(raw).toContain("localLearning");
    expect(raw).not.toMatch(/default_input_mode|candidate_window_color|local_learning/);
  });

  it("保留合法诊断状态并使用脱敏错误码", () => {
    const normalized = normalizeDiagnosticsState({
      engineState: "ready",
      currentSchema: "ziranmaDoublePinyin",
      coreP50Us: 420,
      coreP95Us: 14_200,
      startupMs: 8,
      recentError: "schema-load"
    });

    expect(normalized).toEqual({
      engineState: "ready",
      currentSchema: "ziranmaDoublePinyin",
      coreP50Us: 420,
      coreP95Us: 14_200,
      startupMs: 8,
      recentError: "schema-load"
    });
  });

  it("非法诊断状态回退为脱敏默认值", () => {
    const fixtureInput = "ni" + "hao";
    const normalized = normalizeDiagnosticsState({
      engineState: `/Users/example/${fixtureInput}`,
      currentSchema: "unknown",
      coreP50Us: -1,
      coreP95Us: Number.NaN,
      startupMs: Number.POSITIVE_INFINITY,
      recentError: `/Users/example/${fixtureInput}`
    } as unknown as DiagnosticsState);

    expect(normalized).toEqual({
      engineState: "unavailable",
      currentSchema: "simplifiedPinyin",
      coreP50Us: 0,
      coreP95Us: 0,
      startupMs: 0,
      recentError: "diagnostics-error"
    });
  });

  it("旧毫秒诊断字段归一化为微秒字段", () => {
    const normalized = normalizeDiagnosticsState({
      engineState: "ready",
      currentSchema: "simplifiedPinyin",
      coreP50Ms: 4,
      coreP95Ms: 19,
      startupMs: 8,
      recentError: null
    });

    expect(normalized.coreP50Us).toBe(4_000);
    expect(normalized.coreP95Us).toBe(19_000);
  });

  it("按微秒格式化 Core 延迟为精细毫秒", () => {
    expect(formatLatencyUs(0)).toBe("0 ms");
    expect(formatLatencyUs(420)).toBe("0.42 ms");
    expect(formatLatencyUs(7_300)).toBe("7.30 ms");
    expect(formatLatencyUs(14_200)).toBe("14.2 ms");
    expect(formatLatencyUs(407_000)).toBe("407 ms");
  });
});
