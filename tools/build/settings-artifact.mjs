#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { chmod, cp, lstat, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  SETTINGS_ROOT,
  SettingsBuildFailure,
  createSettingsBuildEnvironment,
  getTargetProfile,
  resolveTargetLayout,
  validateTargetEnvironment,
} from "./target-config.mjs";
import {
  APPLICATION_PATH,
  stageAndPublishArtifact,
  verifyArtifact,
} from "./settings-artifact-validation.mjs";
import {
  SETTINGS_SCHEMA_FILE,
  SETTINGS_SCHEMA_PATH,
  validateSettingsSchema,
} from "./settings-schema-validation.mjs";

/** 解析构建或目标检查参数；路径值只在成功结果中返回。 */
export function parseArguments(argv) {
  const normalized = [...argv];
  const separatorCount = normalized.filter((item) => item === "--").length;
  if (separatorCount > 1) return { ok: false, errorCode: "INVALID_ARGUMENTS" };
  const args = normalized.filter((item) => item !== "--");
  const command = args.shift();
  if (command !== "build" && command !== "verify") {
    return { ok: false, errorCode: "INVALID_ARGUMENTS" };
  }

  const allowed = command === "build"
    ? new Map([["--target", "target"], ["--output", "output"], ["--artifact", "artifact"]])
    : new Map([["--target", "target"], ["--artifact", "artifact"]]);
  const values = {};
  for (let index = 0; index < args.length; index += 2) {
    const property = allowed.get(args[index]);
    const value = args[index + 1];
    if (!property || !value || value.startsWith("--") || property in values) {
      return { ok: false, errorCode: "INVALID_ARGUMENTS" };
    }
    values[property] = value;
  }
  if (!values.target) return { ok: false, errorCode: "TARGET_REQUIRED" };
  const profile = getTargetProfile(values.target);
  if (!profile) return { ok: false, errorCode: "TARGET_INVALID" };

  const layout = resolveTargetLayout({
    target: values.target,
    output: command === "verify" ? values.artifact : values.output,
    artifact: command === "build" ? values.artifact : undefined,
  });
  return {
    ok: true,
    options: {
      command,
      profile,
      layout,
      outputExplicit: values.output !== undefined,
      artifactExplicit: values.artifact !== undefined,
    },
  };
}

/** 调用 Tauri 生成指定目标的 Release App，子进程输出不会进入工具错误。 */
function buildTauriApplication(profile, layout) {
  const result = spawnSync(
    "pnpm",
    ["tauri", "build", "--bundles", "app", "--ci", "--target", profile.name],
    {
      cwd: SETTINGS_ROOT,
      env: createSettingsBuildEnvironment({
        profile,
        cargoTargetDirectory: layout.cargoTargetDirectory,
      }),
      shell: false,
      stdio: "ignore",
    },
  );
  if (result.status !== 0) throw new SettingsBuildFailure("BUILD_FAILED");
}

/** 将 Tauri App 和设置 Schema 安装到暂存目录。 */
async function installArtifact(staging, application) {
  const appInfo = await lstat(application).catch(() => null);
  if (!appInfo?.isDirectory() || appInfo.isSymbolicLink()) {
    throw new SettingsBuildFailure("BUILD_FAILED");
  }
  await cp(application, path.join(staging, APPLICATION_PATH), { recursive: true });
  const executable = path.join(
    staging,
    APPLICATION_PATH,
    "Contents",
    "MacOS",
    "openwen-ime-settings",
  );
  await chmod(executable, 0o755).catch(() => {
    throw new SettingsBuildFailure("BUILD_FAILED");
  });

  const installedSchema = path.join(staging, ...SETTINGS_SCHEMA_PATH.split("/"));
  await mkdir(path.dirname(installedSchema), { recursive: true });
  await cp(path.join(SETTINGS_ROOT, "schema", SETTINGS_SCHEMA_FILE), installedSchema);
}

/** 构建并原子发布 Settings App；显式 App 路径可跳过重复 Tauri 编译。 */
async function buildArtifact(options) {
  validateTargetEnvironment(options.profile);
  await validateSettingsSchema(path.join(SETTINGS_ROOT, "schema", SETTINGS_SCHEMA_FILE));
  if (!options.artifactExplicit) buildTauriApplication(options.profile, options.layout);

  await stageAndPublishArtifact({
    output: options.layout.output,
    profile: options.profile,
    allowVerifiedReplacement: !options.outputExplicit,
    install: (staging) => installArtifact(staging, options.layout.application),
  });
}

/** 检查指定目标的现有 Settings 构建结果，不重新编译应用。 */
async function verifyTarget(options) {
  validateTargetEnvironment(options.profile);
  await verifyArtifact(options.layout.output, options.profile);
}

/** 执行公开 CLI，并把所有失败收敛为固定错误码。 */
async function main() {
  const parsed = parseArguments(process.argv.slice(2));
  if (!parsed.ok) {
    process.stdout.write(`${parsed.errorCode}\n`);
    process.exitCode = 1;
    return;
  }

  try {
    if (parsed.options.command === "build") {
      await buildArtifact(parsed.options);
      process.stdout.write("BUILD_OK\n");
    } else {
      await verifyTarget(parsed.options);
      process.stdout.write("TARGET_OK\n");
    }
  } catch (error) {
    const fallback = parsed.options.command === "build" ? "BUILD_FAILED" : "ARTIFACT_INVALID";
    const code = error instanceof SettingsBuildFailure ? error.code : fallback;
    process.stdout.write(`${code}\n`);
    process.exitCode = 1;
  }
}

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  await main();
}
