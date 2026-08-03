import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import type { SettingsClient } from "./settings/settings-client";
import { createDefaultSettings } from "./settings/settings-model";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function createTestClient(): SettingsClient {
  return {
    getSettings: vi.fn(async () => createDefaultSettings()),
    saveSettings: vi.fn(async (settings) => settings),
    getDiagnostics: vi.fn(async () => ({
      engineState: "ready",
      currentSchema: "simplifiedPinyin",
      coreP50Us: 100,
      coreP95Us: 200,
      startupMs: 3,
      recentError: null
    })),
    clearLocalLearning: vi.fn(async () => ({ cleared: true, message: "ok" })),
    getPlatformCapabilities: vi.fn(async () => ({
      platformId: "mac" as const,
      settingContributionIds: []
    }))
  };
}

afterEach(cleanup);

describe("OpenWen 三页设置中心", () => {
  it("读取完成前只展示稳定加载态，且普通 UI 不读取诊断", async () => {
    const load = deferred<ReturnType<typeof createDefaultSettings>>();
    const client = createTestClient();
    client.getSettings = vi.fn(() => load.promise);

    render(<App settingsClient={client} />);
    expect(screen.getByRole("status")).toHaveTextContent("正在读取本机设置");
    expect(screen.queryByLabelText("默认输入方案")).not.toBeInTheDocument();

    load.resolve(createDefaultSettings());
    expect(await screen.findByLabelText("默认输入方案")).toBeInTheDocument();
    expect(client.getDiagnostics).not.toHaveBeenCalled();
    expect(client.getPlatformCapabilities).not.toHaveBeenCalled();
  });

  it("侧栏只展示输入、外观、本地学习三页并标记当前页", async () => {
    const user = userEvent.setup();
    render(<App settingsClient={createTestClient()} />);

    const navigation = await screen.findByRole("navigation", { name: "设置页" });
    expect(within(navigation).getAllByRole("button").map((item) => item.textContent)).toEqual([
      "输入",
      "外观",
      "本地学习"
    ]);
    expect(within(navigation).queryByText("性能诊断")).not.toBeInTheDocument();
    expect(within(navigation).queryByText("隐私说明")).not.toBeInTheDocument();
    expect(within(navigation).getByRole("button", { name: "输入" })).toHaveAttribute(
      "aria-current",
      "page"
    );

    await user.click(within(navigation).getByRole("button", { name: "外观" }));
    expect(screen.getByRole("heading", { level: 1, name: "外观" })).toBeInTheDocument();
  });

  it("输入页按四个分组完整呈现且无一期或 Rime 内部术语", async () => {
    render(<App settingsClient={createTestClient()} />);
    await screen.findByLabelText("默认输入方案");

    for (const groupName of ["输入方案", "候选与翻页", "默认输入状态", "快捷键"]) {
      expect(screen.getByRole("heading", { level: 2, name: groupName })).toBeInTheDocument();
    }
    expect(screen.getByText("简体拼音")).toBeInTheDocument();
    expect(screen.getByText("自然码双拼")).toBeInTheDocument();
    expect(screen.getByText("五笔86")).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent("一期不提供");
    expect(document.body).not.toHaveTextContent("schema");
    expect(document.body).not.toHaveTextContent("key_binder");
    expect(document.body).toHaveTextContent(
      "组合输入时按 Enter 提交字母编码；关闭后按 Enter 取消当前编码。"
    );
    expect(document.body).not.toHaveTextContent("关闭后 Enter 交给当前应用");
  });

  it("候选数量步进器在 3 到 9 边界禁用相应按钮", async () => {
    const user = userEvent.setup();
    render(<App settingsClient={createTestClient()} />);
    await screen.findByText("候选数量");

    const decrement = screen.getByRole("button", { name: "减少候选数量" });
    const increment = screen.getByRole("button", { name: "增加候选数量" });
    expect(screen.getByLabelText("候选数量")).toHaveTextContent("5");
    await user.click(decrement);
    await user.click(decrement);
    expect(decrement).toBeDisabled();
    expect(screen.getByLabelText("候选数量")).toHaveTextContent("3");
    for (let count = 0; count < 6; count += 1) await user.click(increment);
    expect(increment).toBeDisabled();
    expect(screen.getByLabelText("候选数量")).toHaveTextContent("9");
  });

  it("非法或重复翻页键就地报错并阻止保存", async () => {
    const user = userEvent.setup();
    render(<App settingsClient={createTestClient()} />);
    await screen.findByLabelText("上一页翻页键");

    await user.clear(screen.getByLabelText("上一页翻页键"));
    await user.type(screen.getByLabelText("上一页翻页键"), "中");
    expect(screen.getByText("翻页键必须是两个不同的单个可打印 ASCII 字符")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "保存设置" })).toBeDisabled();

    fireEvent.change(screen.getByLabelText("上一页翻页键"), { target: { value: "=" } });
    expect(screen.getByRole("button", { name: "保存设置" })).toBeDisabled();
  });

  it("草稿跨页保留，只有修改后可保存，成功后回到无修改状态", async () => {
    const user = userEvent.setup();
    const client = createTestClient();
    render(<App settingsClient={client} />);
    const saveButton = await screen.findByRole("button", { name: "保存设置" });
    expect(saveButton).toBeDisabled();

    await user.selectOptions(screen.getByLabelText("默认输入方案"), "wubi86");
    expect(saveButton).toBeEnabled();
    expect(screen.getByText("有未保存的修改")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "外观" }));
    await user.click(screen.getByRole("button", { name: "输入" }));
    expect(screen.getByLabelText("默认输入方案")).toHaveValue("wubi86");

    await user.click(saveButton);
    await waitFor(() => expect(client.saveSettings).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("设置已保存")).toBeInTheDocument();
    expect(saveButton).toBeDisabled();
  });

  it("保存中禁用控件和重复提交，失败后保留草稿且只显示脱敏错误", async () => {
    const user = userEvent.setup();
    const save = deferred<ReturnType<typeof createDefaultSettings>>();
    const client = createTestClient();
    client.saveSettings = vi.fn(() => save.promise);
    render(<App settingsClient={client} />);
    await screen.findByLabelText("默认输入方案");
    await user.selectOptions(screen.getByLabelText("默认输入方案"), "wubi86");
    await user.click(screen.getByRole("button", { name: "保存设置" }));

    expect(screen.getByRole("button", { name: "正在保存" })).toBeDisabled();
    expect(screen.getByLabelText("默认输入方案")).toBeDisabled();
    save.reject(new Error("/Users/private nihao 候选文本"));
    expect(await screen.findByRole("alert")).toHaveTextContent("设置保存失败，请稍后重试");
    expect(screen.getByLabelText("默认输入方案")).toHaveValue("wubi86");
    expect(document.body).not.toHaveTextContent("/Users/private");
    expect(document.body).not.toHaveTextContent("nihao");
  });

  it("读取失败时使用默认设置并持续显示固定说明", async () => {
    const client = createTestClient();
    client.getSettings = vi.fn(async () => { throw new Error("private path"); });
    render(<App settingsClient={client} />);

    expect(await screen.findByLabelText("默认输入方案")).toHaveValue("simplifiedPinyin");
    expect(screen.getByRole("alert")).toHaveTextContent("无法读取本机设置，当前使用默认值");
  });

  it("外观页提供固定内容实时预览、主题、双颜色控件和默认字号 18", async () => {
    const user = userEvent.setup();
    render(<App settingsClient={createTestClient()} />);
    await screen.findByRole("button", { name: "外观" });
    await user.click(screen.getByRole("button", { name: "外观" }));

    const preview = screen.getByLabelText("候选窗实时预览");
    expect(preview).toHaveTextContent("openwen");
    expect(preview).toHaveTextContent("中文输入");
    expect(screen.getByLabelText("候选文字大小")).toHaveValue("18");
    expect(screen.queryByText("候选数量")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "深色" }));
    fireEvent.change(screen.getByLabelText("候选窗颜色文本值"), { target: { value: "#224466" } });
    fireEvent.change(screen.getByLabelText("候选文字大小"), { target: { value: "24" } });
    expect(preview).toHaveAttribute("data-theme", "dark");
    expect(preview).toHaveStyle({ backgroundColor: "#224466", fontSize: "24px" });
  });

  it("非法颜色文本就地报错并阻止保存", async () => {
    const user = userEvent.setup();
    render(<App settingsClient={createTestClient()} />);
    await user.click(await screen.findByRole("button", { name: "外观" }));
    await user.clear(screen.getByLabelText("候选窗颜色文本值"));
    await user.type(screen.getByLabelText("候选窗颜色文本值"), "#fff");

    expect(screen.getByText("请输入 #RRGGBB 格式的颜色值")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "保存设置" })).toBeDisabled();
  });

  it("本地学习说明明确本机边界，关闭不删除已有数据", async () => {
    const user = userEvent.setup();
    render(<App settingsClient={createTestClient()} />);
    await user.click(await screen.findByRole("button", { name: "本地学习" }));

    expect(screen.getAllByText(/仅保存在本机/).length).toBeGreaterThan(0);
    expect(screen.getByText(/不会上传或同步/)).toBeInTheDocument();
    expect(screen.getByText(/关闭不会删除已有数据/)).toBeInTheDocument();
  });

  it("清除使用模态对话框，默认聚焦取消，支持 Escape 并恢复触发焦点", async () => {
    const user = userEvent.setup();
    render(<App settingsClient={createTestClient()} />);
    await user.click(await screen.findByRole("button", { name: "本地学习" }));
    const trigger = screen.getByRole("button", { name: "清除本地学习数据" });
    await user.click(trigger);

    expect(screen.getByRole("dialog", { name: "清除本地学习数据" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "取消" })).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("确认清除不会保存普通设置，也不会改变学习开关，结果使用固定文案", async () => {
    const user = userEvent.setup();
    const client = createTestClient();
    render(<App settingsClient={client} />);
    await user.click(await screen.findByRole("button", { name: "本地学习" }));
    const learningToggle = screen.getByRole("switch", { name: "个性化学习" });
    expect(learningToggle).toBeChecked();
    await user.click(screen.getByRole("button", { name: "清除本地学习数据" }));
    await user.click(screen.getByRole("button", { name: "确认清除" }));

    expect(await screen.findByText("本地学习数据已清除")).toBeInTheDocument();
    expect(client.clearLocalLearning).toHaveBeenCalledTimes(1);
    expect(client.saveSettings).not.toHaveBeenCalled();
    expect(learningToggle).toBeChecked();
  });
});
