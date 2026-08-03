import { spawnSync } from "node:child_process";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const SETTINGS_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

const TARGETS = new Map([
  [
    "aarch64-apple-darwin",
    Object.freeze({
      name: "aarch64-apple-darwin",
      status: "supported",
      platformId: "mac",
      architecture: "arm64",
      appleSdk: "macosx",
      minimumMacOSVersion: "26.0",
    }),
  ],
  [
    "x86_64-pc-windows-msvc",
    Object.freeze({
      name: "x86_64-pc-windows-msvc",
      status: "unavailable",
      platformId: "windows",
      architecture: "x86_64",
      appleSdk: null,
      minimumMacOSVersion: null,
    }),
  ],
]);

/** 表示构建工具可以安全向调用方公开的固定错误码。 */
export class SettingsBuildFailure extends Error {
  /** 使用固定错误码创建失败，不携带底层命令输出或本机路径。 */
  constructor(code) {
    super(code);
    this.code = code;
  }
}

/** 根据公开目标名读取只读配置；未知目标返回 `null`。 */
export function getTargetProfile(target) {
  return TARGETS.get(target) ?? null;
}

/** 根据目标生成构建缓存、Tauri App 和最终输出的标准路径。 */
export function resolveTargetLayout({
  target,
  output,
  artifact,
  settingsRoot = SETTINGS_ROOT,
}) {
  const profile = getTargetProfile(target);
  if (!profile) throw new SettingsBuildFailure("TARGET_INVALID");
  const cargoTargetDirectory = path.join(settingsRoot, ".openwen-build", "cargo");
  return {
    cargoTargetDirectory,
    application: path.resolve(
      settingsRoot,
      artifact ?? path.join(
        cargoTargetDirectory,
        target,
        "release",
        "bundle",
        "macos",
        "OpenWen Settings.app",
      ),
    ),
    output: path.resolve(
      settingsRoot,
      output ?? path.join("dist", target, "release"),
    ),
  };
}

/** 比较点分版本号；实际版本不低于最低版本时返回 `true`。 */
export function isVersionAtLeast(actual, minimum) {
  if (!/^\d+(?:\.\d+)*$/u.test(actual)) return false;
  const actualParts = actual.split(".").map(Number);
  const minimumParts = minimum.split(".").map(Number);
  const length = Math.max(actualParts.length, minimumParts.length);
  for (let index = 0; index < length; index += 1) {
    const difference = (actualParts[index] ?? 0) - (minimumParts[index] ?? 0);
    if (difference !== 0) return difference > 0;
  }
  return true;
}

/** 创建可重现的 macOS 构建环境，并把本机源码路径映射到固定虚拟路径。 */
export function createSettingsBuildEnvironment({
  profile,
  cargoTargetDirectory,
  baseEnvironment = process.env,
  settingsRoot = SETTINGS_ROOT,
  homeDirectory = homedir(),
}) {
  return {
    ...baseEnvironment,
    CARGO_TARGET_DIR: cargoTargetDirectory,
    MACOSX_DEPLOYMENT_TARGET: profile.minimumMacOSVersion,
    SOURCE_DATE_EPOCH: "1",
    ZERO_AR_DATE: "1",
    RUSTFLAGS: [
      baseEnvironment.RUSTFLAGS,
      `--remap-path-prefix=${homeDirectory}=/openwen-build`,
      `--remap-path-prefix=${settingsRoot}=/openwen-ime/settings`,
    ].filter(Boolean).join(" "),
  };
}

/** 执行环境探测命令；失败时不向上层传递标准错误。 */
function runEnvironmentCommand(command, args) {
  return spawnSync(command, args, {
    encoding: "utf8",
    shell: false,
    stdio: ["ignore", "pipe", "ignore"],
  });
}

/**
 * 检查当前主机是否能构建指定目标。
 *
 * Windows 目标会稳定返回未实现；macOS 目标要求 arm64 主机、Apple Clang、
 * macOS 26.0 或更高 SDK，以及已经安装的 Rust 目标。
 */
export function validateTargetEnvironment(profile) {
  if (profile.status !== "supported") {
    throw new SettingsBuildFailure("TARGET_BUILD_NOT_IMPLEMENTED");
  }
  if (process.platform !== "darwin" || process.arch !== "arm64") {
    throw new SettingsBuildFailure("TARGET_HOST_UNSUPPORTED");
  }

  const xcode = runEnvironmentCommand("xcodebuild", ["-version"]);
  const clang = runEnvironmentCommand("xcrun", [
    "--sdk",
    profile.appleSdk,
    "clang",
    "--version",
  ]);
  if (
    xcode.status !== 0 ||
    clang.status !== 0 ||
    !clang.stdout.includes("Apple clang")
  ) {
    throw new SettingsBuildFailure("TARGET_HOST_UNSUPPORTED");
  }

  const sdk = runEnvironmentCommand("xcrun", [
    "--sdk",
    profile.appleSdk,
    "--show-sdk-version",
  ]);
  if (
    sdk.status !== 0 ||
    !isVersionAtLeast(sdk.stdout.trim(), profile.minimumMacOSVersion)
  ) {
    throw new SettingsBuildFailure("TARGET_SDK_UNSUPPORTED");
  }

  const rustTargets = runEnvironmentCommand("rustup", ["target", "list", "--installed"]);
  if (
    rustTargets.status !== 0 ||
    !rustTargets.stdout.split(/\r?\n/u).includes(profile.name)
  ) {
    throw new SettingsBuildFailure("TARGET_HOST_UNSUPPORTED");
  }
}
