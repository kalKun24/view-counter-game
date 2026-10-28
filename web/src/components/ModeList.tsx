import { enabledModes, MODES, type ModeId, type ModeInfo } from "../modes";

interface ButtonProps {
  mode: ModeInfo;
  enabled: boolean;
  onSelect: (id: ModeId) => void;
}

/** 準備中は disabled でなく aria-disabled にして、キーボードで到達でき読み上げで分かるようにする。 */
export function ModeButton({ mode, enabled, onSelect }: ButtonProps) {
  return (
    <button
      type="button"
      className="mode"
      aria-disabled={enabled ? undefined : true}
      onClick={() => {
        if (enabled) onSelect(mode.id);
      }}
      data-testid={`mode-${mode.id}`}
    >
      <span className="tag">
        {mode.tag}
        {enabled ? "" : " ・ 準備中"}
      </span>
      <b>{mode.title}</b>
      <span className="muted small">{mode.description}</span>
    </button>
  );
}

export function ModeList({
  onSelect,
  enabled = enabledModes,
}: {
  onSelect: (id: ModeId) => void;
  enabled?: Record<ModeId, boolean>;
}) {
  return (
    <div className="modes">
      {MODES.map((m) => (
        <ModeButton key={m.id} mode={m} enabled={enabled[m.id]} onSelect={onSelect} />
      ))}
    </div>
  );
}
