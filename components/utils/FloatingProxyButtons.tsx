"use client";
import React from "react";

type Props = {
  confirmSelector?: string;
  cancelSelector?: string;
};

export default function FloatingProxyButtons({
  confirmSelector = '[data-testid="confirm-import"]',
  cancelSelector =  '[data-testid="cancel-import"]',
}: Props) {
  const [hasConfirm, setHasConfirm] = React.useState(false);
  const [hasCancel, setHasCancel] = React.useState(false);
  const visible = hasConfirm || hasCancel;

  const update = React.useCallback(() => {
    setHasConfirm(!!document.querySelector(confirmSelector));
    setHasCancel(!!document.querySelector(cancelSelector));
  }, [confirmSelector, cancelSelector]);

  const click = (sel: string) => {
    const el = document.querySelector<HTMLButtonElement>(sel);
    if (el) el.click();
  };

  React.useEffect(() => {
    update();
    const obs = new MutationObserver(update);
    obs.observe(document.body, { childList: true, subtree: true });
    const onKey = (e: KeyboardEvent) => {
      const metaS = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s";
      const esc = e.key === "Escape";
      if (metaS && hasConfirm) {
        e.preventDefault();
        click(confirmSelector);
      } else if (esc && hasCancel) {
        click(cancelSelector);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      obs.disconnect();
      window.removeEventListener("keydown", onKey);
    };
  }, [update, hasConfirm, hasCancel, confirmSelector, cancelSelector]);

  if (!visible) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[1000] flex items-center gap-3">
      {hasCancel && (
        <button
          onClick={() => click(cancelSelector)}
          className="px-3 py-2 rounded-xl border border-gray-300 bg-white text-gray-800 shadow"
        >
          Cancel
        </button>
      )}
      {hasConfirm && (
        <button
          onClick={() => click(confirmSelector)}
          className="px-4 py-2 rounded-xl bg-emerald-600 text-white shadow"
        >
          Confirm Import
        </button>
      )}
    </div>
  );
}
