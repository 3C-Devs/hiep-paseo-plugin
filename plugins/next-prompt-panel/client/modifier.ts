import { useEffect, useState } from "react";
import { Platform } from "react-native";

type KeyTarget = {
  addEventListener(
    type: string,
    listener: (event: { metaKey?: boolean; ctrlKey?: boolean }) => void,
  ): void;
  removeEventListener(
    type: string,
    listener: (event: { metaKey?: boolean; ctrlKey?: boolean }) => void,
  ): void;
  navigator?: { platform?: string; userAgent?: string };
};

/** Whether Command (Control off macOS) is held. Always false on native, which has no hover. */
export function usePrimaryModifier(): boolean {
  const [held, setHeld] = useState(false);
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const target = globalThis as unknown as KeyTarget;
    const mac = /Mac|iPhone|iPad/.test(
      target.navigator?.platform ?? target.navigator?.userAgent ?? "",
    );
    const read = (event: { metaKey?: boolean; ctrlKey?: boolean }) =>
      setHeld(!!(mac ? event.metaKey : event.ctrlKey));
    // A key released in another window never reaches this one.
    const clear = () => setHeld(false);
    target.addEventListener("keydown", read);
    target.addEventListener("keyup", read);
    target.addEventListener("blur", clear);
    return () => {
      target.removeEventListener("keydown", read);
      target.removeEventListener("keyup", read);
      target.removeEventListener("blur", clear);
    };
  }, []);
  return held;
}
