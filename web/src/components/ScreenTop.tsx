import { Heading } from "./Heading";

interface Props {
  /** 「← 戻る」「やめる」 */
  backLabel: string;
  onBack: () => void;
  backTestId: string;
  /** モード名（eyebrow 見た目の h1） */
  title: string;
  focusHeading?: boolean;
}

export function ScreenTop({ backLabel, onBack, backTestId, title, focusHeading = true }: Props) {
  return (
    <div className="top">
      <button type="button" className="btn ghost" onClick={onBack} data-testid={backTestId}>
        {backLabel}
      </button>
      <Heading className="eyebrow" focusOnMount={focusHeading}>
        {title}
      </Heading>
    </div>
  );
}
