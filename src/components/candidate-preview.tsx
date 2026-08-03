import type { AppearanceSettings } from "../settings/settings-model";

const previewCandidates = ["中文输入", "输入法", "开源", "离线", "隐私"];

/** 使用固定演示内容实时预览候选窗外观，不读取真实输入。 */
export function CandidatePreview({ appearance }: { appearance: AppearanceSettings }) {
  const isDark = appearance.theme === "dark";
  return (
    <div className="preview-stage">
      <p className="preview-label">实时预览</p>
      <div
        aria-label="候选窗实时预览"
        className="candidate-preview"
        data-theme={appearance.theme}
        style={{
          backgroundColor: appearance.candidateWindowColor,
          color: isDark ? "#f7f5ef" : "#171b1f",
          fontSize: `${appearance.candidateTextSize}px`
        }}
      >
        <div className="preview-composition">openwen</div>
        <ol>
          {previewCandidates.map((candidate, index) => (
            <li className={index === 0 ? "selected" : ""} key={candidate}>
              <span>{index + 1}</span>
              {candidate}
            </li>
          ))}
        </ol>
      </div>
      <p className="preview-note">预览仅使用固定演示内容，不读取你的输入。</p>
    </div>
  );
}
