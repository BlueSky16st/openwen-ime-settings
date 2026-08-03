import { Minus, Plus } from "lucide-react";
import type { ReactNode } from "react";

/** 渲染带标题和说明的设置分组。 */
export function SettingsSection({
  title,
  description,
  children
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="settings-section" aria-labelledby={`section-${title}`}>
      <div className="section-heading">
        <h2 id={`section-${title}`}>{title}</h2>
        {description ? <p>{description}</p> : null}
      </div>
      <div className="settings-card">{children}</div>
    </section>
  );
}

/** 对齐设置名称、就近说明和交互控件。 */
export function SettingRow({
  title,
  description,
  children,
  stacked = false
}: {
  title: string;
  description: string;
  children: ReactNode;
  stacked?: boolean;
}) {
  return (
    <div className={stacked ? "setting-row setting-row-stacked" : "setting-row"}>
      <div className="setting-copy">
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
      <div className="setting-control">{children}</div>
    </div>
  );
}

/** 渲染具备禁用和辅助说明状态的统一开关行。 */
export function ToggleRow({
  title,
  description,
  checked,
  onChange,
  ariaLabel = title
}: {
  title: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  ariaLabel?: string;
}) {
  return (
    <SettingRow title={title} description={description}>
      <button
        aria-checked={checked}
        aria-label={ariaLabel}
        className="switch"
        role="switch"
        type="button"
        onClick={() => onChange(!checked)}
      >
        <span className="switch-thumb" />
      </button>
    </SettingRow>
  );
}

/** 在最小值与最大值边界内递增或递减整数设置。 */
export function Stepper({
  label,
  value,
  min,
  max,
  onChange
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="stepper">
      <button
        aria-label={`减少${label}`}
        disabled={value <= min}
        type="button"
        onClick={() => onChange(Math.max(min, value - 1))}
      >
        <Minus aria-hidden="true" size={15} />
      </button>
      <span aria-label={label}>{value}</span>
      <button
        aria-label={`增加${label}`}
        disabled={value >= max}
        type="button"
        onClick={() => onChange(Math.min(max, value + 1))}
      >
        <Plus aria-hidden="true" size={15} />
      </button>
    </div>
  );
}

/** 以可被辅助技术读取的方式显示字段级校验错误。 */
export function FieldError({ id, message }: { id: string; message?: string }) {
  return message ? (
    <p className="field-error" id={id} role="alert">
      {message}
    </p>
  ) : null;
}
