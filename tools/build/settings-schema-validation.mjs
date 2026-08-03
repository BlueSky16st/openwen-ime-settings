import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import { SettingsBuildFailure } from "./target-config.mjs";

export const SETTINGS_SCHEMA_FILE = "openwen-ime-settings.schema.json";
export const SETTINGS_SCHEMA_PATH = `share/openwen/settings/${SETTINGS_SCHEMA_FILE}`;
export const SETTINGS_CONTRACT_VERSION = 1;

const EXPECTED_DRAFT = "https://json-schema.org/draft/2020-12/schema";
const EXPECTED_ID = "https://openwen.dev/schema/settings/v1/openwen-ime-settings.schema.json";

const CURRENT_SETTINGS = Object.freeze({
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
    noCandidateSpaceAction: "clearComposition",
  },
  appearance: {
    theme: "light",
    candidateWindowColor: "#FFFFFF",
    candidateTextSize: 18,
  },
  localLearning: { enabled: true },
});

/** 解释 Settings Schema 使用到的 Draft 2020-12 关键字。 */
function accepts(schema, value) {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) return false;
  if (schema.allOf && !schema.allOf.every((child) => accepts(child, value))) return false;
  if (schema.not && accepts(schema.not, value)) return false;
  if (schema.type === "object") {
    if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
    const properties = schema.properties ?? {};
    if ((schema.required ?? []).some((key) => !(key in value))) return false;
    if (
      schema.additionalProperties === false &&
      Object.keys(value).some((key) => !(key in properties))
    ) {
      return false;
    }
    return Object.entries(properties).every(
      ([key, child]) => !(key in value) || accepts(child, value[key]),
    );
  }
  if (schema.type === "string" && typeof value !== "string") return false;
  if (schema.type === "integer" && !Number.isInteger(value)) return false;
  if (schema.type === "boolean" && typeof value !== "boolean") return false;
  if (schema.enum && !schema.enum.includes(value)) return false;
  if (schema.const !== undefined && value !== schema.const) return false;
  if (schema.minimum !== undefined && value < schema.minimum) return false;
  if (schema.maximum !== undefined && value > schema.maximum) return false;
  if (schema.pattern !== undefined && !new RegExp(schema.pattern, "u").test(value)) return false;
  return true;
}

/** 返回用于确认 Schema 拒绝边界的固定非法设置集合。 */
function invalidSettingsSamples() {
  const missing = structuredClone(CURRENT_SETTINGS);
  delete missing.input.enterCommitsRawCode;
  return [
    missing,
    { ...CURRENT_SETTINGS, unexpected: true },
    { ...CURRENT_SETTINGS, input: { ...CURRENT_SETTINGS.input, unexpected: true } },
    { ...CURRENT_SETTINGS, input: { ...CURRENT_SETTINGS.input, defaultInputMode: "unknown" } },
    { ...CURRENT_SETTINGS, input: { ...CURRENT_SETTINGS.input, candidateCount: 2 } },
    { ...CURRENT_SETTINGS, input: { ...CURRENT_SETTINGS.input, candidateCount: 10 } },
    { ...CURRENT_SETTINGS, input: { ...CURRENT_SETTINGS.input, noCandidateSpaceAction: "unknown" } },
    { ...CURRENT_SETTINGS, input: { ...CURRENT_SETTINGS.input, pagePreviousKey: " " } },
    { ...CURRENT_SETTINGS, input: { ...CURRENT_SETTINGS.input, pageNextKey: "中" } },
    {
      ...CURRENT_SETTINGS,
      input: { ...CURRENT_SETTINGS.input, pagePreviousKey: "[", pageNextKey: "[" },
    },
    { ...CURRENT_SETTINGS, appearance: { ...CURRENT_SETTINGS.appearance, theme: "system" } },
    {
      ...CURRENT_SETTINGS,
      appearance: { ...CURRENT_SETTINGS.appearance, candidateWindowColor: "#fff" },
    },
    {
      ...CURRENT_SETTINGS,
      appearance: { ...CURRENT_SETTINGS.appearance, candidateTextSize: 11 },
    },
    {
      ...CURRENT_SETTINGS,
      appearance: { ...CURRENT_SETTINGS.appearance, candidateTextSize: 29 },
    },
  ];
}

/**
 * 读取并校验发布 Schema。
 *
 * 校验覆盖固定标识、契约版本、当前设置、历史合法字号17和所有一期字段边界。
 * 失败只抛出固定错误码，不返回 Schema 内容或文件路径。
 */
export async function validateSettingsSchema(schemaPath) {
  let content;
  let schema;
  try {
    content = await readFile(schemaPath);
    schema = JSON.parse(content.toString("utf8"));
  } catch {
    throw new SettingsBuildFailure("SETTINGS_SCHEMA_INVALID");
  }

  const legacySettings = {
    ...CURRENT_SETTINGS,
    appearance: { ...CURRENT_SETTINGS.appearance, candidateTextSize: 17 },
  };
  if (
    schema.$schema !== EXPECTED_DRAFT ||
    schema.$id !== EXPECTED_ID ||
    schema["x-openwen-ime-settings-contract-version"] !== SETTINGS_CONTRACT_VERSION ||
    !accepts(schema, CURRENT_SETTINGS) ||
    !accepts(schema, legacySettings) ||
    invalidSettingsSamples().some((sample) => accepts(schema, sample))
  ) {
    throw new SettingsBuildFailure("SETTINGS_SCHEMA_INVALID");
  }

  return {
    sha256: createHash("sha256").update(content).digest("hex"),
  };
}
