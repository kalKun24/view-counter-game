import { useState, type ComponentType } from "react";
import { AppShell } from "./components/AppShell";
import { Home } from "./components/Home";
import { enabledModes, type ModeId } from "./modes";
import { CountdownMode } from "./modes/countdown/CountdownMode";
import { VersusMode } from "./modes/versus/VersusMode";

/** モードごとの画面。#4・#5 は自分の画面をここに足し、modes.ts の enabledModes を true にする。 */
const modeScreens: Partial<Record<ModeId, ComponentType<{ onExit: () => void }>>> = {
  countdown: CountdownMode,
  versus: VersusMode,
};

export default function App() {
  const [mode, setMode] = useState<ModeId | null>(null);
  // 一度でもホームを離れたら、ホームに戻ったとき見出しへフォーカスを移す。
  const [navigated, setNavigated] = useState(false);

  const Screen = mode ? modeScreens[mode] : undefined;

  return (
    <AppShell>
      {Screen ? (
        <Screen
          onExit={() => {
            setMode(null);
          }}
        />
      ) : (
        <Home
          focusHeading={navigated}
          onSelect={(id) => {
            if (!enabledModes[id] || !modeScreens[id]) return;
            setNavigated(true);
            setMode(id);
          }}
        />
      )}
    </AppShell>
  );
}
