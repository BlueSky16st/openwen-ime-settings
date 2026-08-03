import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  access,
  lstat,
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  readlink,
  rename,
  rm,
  rmdir,
  stat,
  writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

import {
  SETTINGS_ROOT,
  SettingsBuildFailure,
  isVersionAtLeast,
} from "./target-config.mjs";
import {
  SETTINGS_CONTRACT_VERSION,
  SETTINGS_SCHEMA_PATH,
  validateSettingsSchema,
} from "./settings-schema-validation.mjs";

export const APPLICATION_PATH = "OpenWen Settings.app";
export const MANIFEST_NAME = "openwen-ime-settings-manifest.json";

const APPLICATION_NAME = "OpenWen Settings";
const BUNDLE_IDENTIFIER = "dev.openwen.settings";
const EXECUTABLE_NAME = "openwen-ime-settings";
const EXECUTABLE_PATH = `${APPLICATION_PATH}/Contents/MacOS/${EXECUTABLE_NAME}`;
const ALLOWED_FILES = new Set([
  `${APPLICATION_PATH}/Contents/Info.plist`,
  EXECUTABLE_PATH,
  `${APPLICATION_PATH}/Contents/Resources/icon.icns`,
  SETTINGS_SCHEMA_PATH,
]);
const SENSITIVE_CONTENT = [
  ["ni", "hao"].join(""),
  ["ni", "hk"].join(""),
  ["wq", "vb"].join(""),
  ["你", "好"].join(""),
  ["候选选择", "历史"].join(""),
  ["上下文", "文本"].join(""),
  ["真实用户", "输入"].join(""),
  ["candidateSelection", "History"].join(""),
  ["context", "Text"].join(""),
  ["diagnostic", "Samples"].join(""),
  ["user", "Input"].join(""),
  ["commit", "Text"].join(""),
].map((value) => Buffer.from(value));

/** 将绝对路径转换为 manifest 使用的正斜杠相对路径。 */
function manifestPath(root, absolutePath) {
  return path.relative(root, absolutePath).split(path.sep).join("/");
}

/** 判断解析后的路径是否仍在给定根目录中。 */
function isWithinRoot(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

/** 返回文件内容的小写 SHA-256。 */
async function sha256File(filePath) {
  return createHash("sha256").update(await readFile(filePath)).digest("hex");
}

/** 递归收集普通文件和符号链接，拒绝失效链接及目录逃逸。 */
async function collectEntries(root) {
  const files = [];
  const links = [];

  async function walk(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name, "en"));
    for (const entry of entries) {
      const absolutePath = path.join(directory, entry.name);
      const relativePath = manifestPath(root, absolutePath);
      const info = await lstat(absolutePath);
      if (info.isSymbolicLink()) {
        const target = await readlink(absolutePath);
        const resolvedTarget = path.resolve(path.dirname(absolutePath), target);
        if (path.isAbsolute(target) || !isWithinRoot(root, resolvedTarget)) {
          throw new SettingsBuildFailure("ARTIFACT_INVALID");
        }
        await access(resolvedTarget).catch(() => {
          throw new SettingsBuildFailure("ARTIFACT_INVALID");
        });
        links.push({ path: relativePath, target: target.split(path.sep).join("/") });
      } else if (info.isDirectory()) {
        await walk(absolutePath);
      } else if (info.isFile() && relativePath !== MANIFEST_NAME) {
        files.push({
          path: relativePath,
          bytes: info.size,
          sha256: await sha256File(absolutePath),
        });
      } else if (!info.isFile()) {
        throw new SettingsBuildFailure("ARTIFACT_INVALID");
      }
    }
  }

  await walk(root);
  files.sort((left, right) => left.path.localeCompare(right.path, "en"));
  links.sort((left, right) => left.path.localeCompare(right.path, "en"));
  return { files, links };
}

/** 使用系统 plutil 将 Info.plist 转成 XML，失败时不保留工具输出。 */
function readPlistXml(plistPath) {
  const result = spawnSync("plutil", ["-convert", "xml1", "-o", "-", plistPath], {
    encoding: "utf8",
    shell: false,
    stdio: ["ignore", "pipe", "ignore"],
  });
  if (result.status !== 0) throw new SettingsBuildFailure("ARTIFACT_INVALID");
  return result.stdout;
}

/** 从 XML Info.plist 中读取指定字符串键。 */
function plistString(plist, key) {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const match = plist.match(
    new RegExp(`<key>\\s*${escapedKey}\\s*</key>\\s*<string>([^<]+)</string>`, "u"),
  );
  return match?.[1] ?? "";
}

/** 检查 App 名称、Bundle ID、可执行文件、图标和最低系统版本。 */
async function validateApplication(root, profile) {
  const contents = path.join(root, APPLICATION_PATH, "Contents");
  const plistPath = path.join(contents, "Info.plist");
  const plistInfo = await stat(plistPath).catch(() => null);
  if (!plistInfo?.isFile()) throw new SettingsBuildFailure("ARTIFACT_INVALID");
  const plist = readPlistXml(plistPath);
  if (
    plistString(plist, "CFBundleIdentifier") !== BUNDLE_IDENTIFIER ||
    plistString(plist, "CFBundleName") !== APPLICATION_NAME ||
    plistString(plist, "CFBundleExecutable") !== EXECUTABLE_NAME ||
    plistString(plist, "LSMinimumSystemVersion") !== profile.minimumMacOSVersion
  ) {
    throw new SettingsBuildFailure("ARTIFACT_INVALID");
  }

  const iconName = plistString(plist, "CFBundleIconFile");
  if (iconName !== "icon.icns") throw new SettingsBuildFailure("ARTIFACT_INVALID");

  const executable = path.join(contents, "MacOS", EXECUTABLE_NAME);
  const executableInfo = await stat(executable).catch(() => null);
  const iconInfo = await stat(path.join(contents, "Resources", iconName)).catch(() => null);
  if (
    !executableInfo?.isFile() ||
    (executableInfo.mode & 0o111) === 0 ||
    !iconInfo?.isFile()
  ) {
    throw new SettingsBuildFailure("ARTIFACT_INVALID");
  }
  return executable;
}

/** 检查 Mach-O 架构、Apple 平台和部署目标。 */
function validateMachO(executable, profile) {
  const architectures = spawnSync("lipo", ["-archs", executable], {
    encoding: "utf8",
    shell: false,
    stdio: ["ignore", "pipe", "ignore"],
  });
  const buildVersion = spawnSync("xcrun", ["vtool", "-show-build", executable], {
    encoding: "utf8",
    shell: false,
    stdio: ["ignore", "pipe", "ignore"],
  });
  const minimumMatch = buildVersion.stdout.match(/\bminos\s+(\d+(?:\.\d+)*)\b/u);
  if (
    architectures.status !== 0 ||
    architectures.stdout.trim() !== profile.architecture ||
    buildVersion.status !== 0 ||
    !/\bplatform\s+MACOS\b/u.test(buildVersion.stdout) ||
    !minimumMatch ||
    !isVersionAtLeast(minimumMatch[1], profile.minimumMacOSVersion) ||
    !isVersionAtLeast(profile.minimumMacOSVersion, minimumMatch[1])
  ) {
    throw new SettingsBuildFailure("ARTIFACT_INVALID");
  }
}

/** 拒绝 Foundation、Core helper、Rime 运行库、词库和用户数据库。 */
function validateExcludedRuntimePaths(entries) {
  const forbidden = [
    /(^|\/)openwen-core-control($|\/)/iu,
    /(^|\/)OpenWenCore($|\/)/u,
    /librime/iu,
    /(^|\/)openwen-ime-foundation-manifest\.json$/u,
    /(^|\/)[^/]*\.userdb(?:\/|$)/iu,
    /(^|\/)(?:default|weasel|squirrel)\.ya?ml$/iu,
    /\.(?:prism|reverse|table)\.bin$/iu,
  ];
  for (const entry of [...entries.files, ...entries.links]) {
    if (forbidden.some((pattern) => pattern.test(entry.path))) {
      throw new SettingsBuildFailure("ARTIFACT_INVALID");
    }
  }
}

/** 只允许 Settings App 和设置 Schema 的固定文件集合。 */
function validateFixedLayout(entries) {
  if (
    entries.links.length !== 0 ||
    entries.files.length !== ALLOWED_FILES.size ||
    entries.files.some((entry) => !ALLOWED_FILES.has(entry.path))
  ) {
    throw new SettingsBuildFailure("ARTIFACT_INVALID");
  }
}

/** 扫描构建结果，拒绝本机绝对路径和隐私敏感文本。 */
async function validateArtifactContent(root, files) {
  const privatePrefixes = [SETTINGS_ROOT, homedir()]
    .filter((value, index, all) => value && all.indexOf(value) === index)
    .map((value) => Buffer.from(value));
  for (const file of files) {
    const content = await readFile(path.join(root, ...file.path.split("/")));
    if (
      privatePrefixes.some((prefix) => content.includes(prefix)) ||
      SENSITIVE_CONTENT.some((token) => content.includes(token))
    ) {
      throw new SettingsBuildFailure("ARTIFACT_INVALID");
    }
  }
}

/** 检查安装后的完整 Settings 构建目录并返回确定性文件清单。 */
async function inspectArtifact(root, profile) {
  const rootInfo = await lstat(root).catch(() => null);
  if (!rootInfo?.isDirectory() || rootInfo.isSymbolicLink()) {
    throw new SettingsBuildFailure("ARTIFACT_INVALID");
  }
  const executable = await validateApplication(root, profile);
  validateMachO(executable, profile);
  const schema = await validateSettingsSchema(path.join(root, ...SETTINGS_SCHEMA_PATH.split("/")));
  const entries = await collectEntries(root);
  validateFixedLayout(entries);
  validateExcludedRuntimePaths(entries);
  await validateArtifactContent(root, entries.files);
  return { ...entries, schemaSha256: schema.sha256 };
}

/** 以稳定字段顺序写入 Settings 构建清单。 */
export async function generateArtifactManifest(root, profile) {
  const inspected = await inspectArtifact(root, profile);
  const manifest = {
    schemaVersion: 1,
    packageVersion: "0.1.0",
    settingsContractVersion: SETTINGS_CONTRACT_VERSION,
    target: profile.name,
    configuration: "release",
    platformId: profile.platformId,
    architecture: profile.architecture,
    appleSdk: profile.appleSdk,
    minimumMacOSVersion: profile.minimumMacOSVersion,
    application: {
      artifactPath: APPLICATION_PATH,
      bundleIdentifier: BUNDLE_IDENTIFIER,
    },
    settingsSchema: {
      artifactPath: SETTINGS_SCHEMA_PATH,
      sha256: inspected.schemaSha256,
    },
    files: inspected.files,
    links: inspected.links,
  };
  await writeFile(
    path.join(root, MANIFEST_NAME),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );
  return manifest;
}

/** 比较两个 JSON 值的确定性序列化结果。 */
function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

/** 校验 manifest 元数据、Schema 哈希和完整文件集合。 */
export async function verifyArtifact(root, profile) {
  const manifest = await readFile(path.join(root, MANIFEST_NAME), "utf8")
    .then(JSON.parse)
    .catch(() => null);
  if (
    manifest?.schemaVersion !== 1 ||
    manifest?.packageVersion !== "0.1.0" ||
    manifest?.settingsContractVersion !== SETTINGS_CONTRACT_VERSION ||
    manifest?.target !== profile.name ||
    manifest?.configuration !== "release" ||
    manifest?.platformId !== profile.platformId ||
    manifest?.architecture !== profile.architecture ||
    manifest?.appleSdk !== profile.appleSdk ||
    manifest?.minimumMacOSVersion !== profile.minimumMacOSVersion ||
    !sameJson(manifest?.application, {
      artifactPath: APPLICATION_PATH,
      bundleIdentifier: BUNDLE_IDENTIFIER,
    }) ||
    manifest?.settingsSchema?.artifactPath !== SETTINGS_SCHEMA_PATH ||
    !/^[0-9a-f]{64}$/u.test(manifest?.settingsSchema?.sha256 ?? "") ||
    !Array.isArray(manifest?.files) ||
    !Array.isArray(manifest?.links)
  ) {
    throw new SettingsBuildFailure("ARTIFACT_INVALID");
  }

  const inspected = await inspectArtifact(root, profile);
  if (
    manifest.settingsSchema.sha256 !== inspected.schemaSha256 ||
    !sameJson(manifest.files, inspected.files) ||
    !sameJson(manifest.links, inspected.links)
  ) {
    throw new SettingsBuildFailure("ARTIFACT_INVALID");
  }
}

/** 判断输出目录是否等于 Settings 仓根或其祖先。 */
function containsSettingsRoot(output) {
  return isWithinRoot(output, SETTINGS_ROOT);
}

/** 检查发布位置；只有默认目录允许替换已通过验证的旧构建结果。 */
async function inspectPublicationTarget(output, profile, allowVerifiedReplacement) {
  const resolvedOutput = path.resolve(output);
  if (containsSettingsRoot(resolvedOutput)) {
    throw new SettingsBuildFailure("OUTPUT_INVALID");
  }
  const info = await lstat(resolvedOutput).catch((error) => {
    if (error?.code === "ENOENT") return null;
    throw new SettingsBuildFailure("OUTPUT_INVALID");
  });
  if (!info) return { output: resolvedOutput, exists: false };
  if (!allowVerifiedReplacement || !info.isDirectory() || info.isSymbolicLink()) {
    throw new SettingsBuildFailure("OUTPUT_INVALID");
  }
  await verifyArtifact(resolvedOutput, profile).catch(() => {
    throw new SettingsBuildFailure("OUTPUT_INVALID");
  });
  return { output: resolvedOutput, exists: true };
}

/**
 * 在输出目录同级完成暂存、完整验证和原子替换。
 *
 * 安装或验证失败时保留旧结果；显式输出路径存在时始终拒绝覆盖。
 */
export async function stageAndPublishArtifact({
  output,
  profile,
  allowVerifiedReplacement,
  install,
}) {
  if (typeof install !== "function") throw new SettingsBuildFailure("ARTIFACT_INVALID");
  const initial = await inspectPublicationTarget(output, profile, allowVerifiedReplacement);
  const parent = path.dirname(initial.output);
  await mkdir(parent, { recursive: true });
  const staging = await mkdtemp(path.join(parent, ".openwen-ime-settings-stage-"));
  let stagingExists = true;
  let previousOutput = "";

  try {
    await install(staging);
    await generateArtifactManifest(staging, profile);
    await verifyArtifact(staging, profile);

    const publishTarget = await inspectPublicationTarget(
      initial.output,
      profile,
      allowVerifiedReplacement,
    );
    if (publishTarget.exists) {
      previousOutput = await mkdtemp(path.join(parent, ".openwen-ime-settings-old-"));
      await rmdir(previousOutput);
      await rename(publishTarget.output, previousOutput);
    }
    try {
      await rename(staging, publishTarget.output);
      stagingExists = false;
    } catch (error) {
      if (previousOutput) {
        await rename(previousOutput, publishTarget.output);
        previousOutput = "";
      }
      throw error;
    }
    if (previousOutput) {
      await rm(previousOutput, { recursive: true, force: false });
      previousOutput = "";
    }
  } finally {
    if (stagingExists) await rm(staging, { recursive: true, force: true });
  }
}
