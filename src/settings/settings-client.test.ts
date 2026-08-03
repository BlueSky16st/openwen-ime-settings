import { beforeEach, describe, expect, it, vi } from "vitest";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));

vi.mock("@tauri-apps/api/core", () => ({ invoke }));

import {
  tauriSettingsClient,
  type SettingsClient
} from "./settings-client";
import { createDefaultSettings } from "./settings-model";

describe("Settings Tauri 客户端", () => {
  beforeEach(() => invoke.mockReset());

  it("把五个操作映射到对应的 Tauri command 和参数", async () => {
    const client: SettingsClient = tauriSettingsClient;
    const settings = createDefaultSettings();
    const diagnostics = {
      engineState: "ready",
      currentSchema: "simplifiedPinyin",
      coreP50Us: 420,
      coreP95Us: 14_200,
      startupMs: 3,
      recentError: null
    };
    const clearResult = { cleared: true, message: "ok" };
    const capabilities = {
      platformId: "mac",
      settingContributionIds: []
    };
    invoke
      .mockResolvedValueOnce(settings)
      .mockResolvedValueOnce(settings)
      .mockResolvedValueOnce(diagnostics)
      .mockResolvedValueOnce(clearResult)
      .mockResolvedValueOnce(capabilities);

    await expect(client.getSettings()).resolves.toEqual(settings);
    await expect(client.saveSettings(settings)).resolves.toEqual(settings);
    await expect(client.getDiagnostics()).resolves.toEqual(diagnostics);
    await expect(client.clearLocalLearning()).resolves.toEqual(clearResult);
    await expect(client.getPlatformCapabilities()).resolves.toEqual(capabilities);
    expect(invoke.mock.calls).toEqual([
      ["get_settings"],
      ["save_settings", { settings }],
      ["get_diagnostics"],
      ["clear_local_learning"],
      ["get_platform_capabilities"]
    ]);
  });
});
