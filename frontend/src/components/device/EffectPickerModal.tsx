import { useEffect, useState } from "react";
import { readNumber } from "../../lib/json";

export type EffectPickerModalProps = {
  open: boolean;
  onClose: () => void;
  effectNames: string[] | undefined;
  selectedIndex: number;
  onPick: (index: number) => void;
  disabled?: boolean;
};

export function EffectPickerModal({
  open,
  onClose,
  effectNames,
  selectedIndex,
  onPick,
  disabled,
}: EffectPickerModalProps) {
  const [manualIdx, setManualIdx] = useState(String(selectedIndex));

  useEffect(() => {
    if (open) {
      setManualIdx(String(selectedIndex));
    }
  }, [open, selectedIndex]);

  const hasList = effectNames && effectNames.length > 0;

  return (
    <dialog
      className="modal"
      open={open}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div
        className="modal-box flex max-h-[85vh] max-w-lg flex-col gap-3 p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold">Effect</h3>
        {hasList ? (
          <ul className="menu menu-sm max-h-[60vh] min-h-0 flex-1 overflow-y-auto rounded-lg border border-base-300 bg-base-100 p-1">
            {effectNames!.map((name, idx) => (
              <li key={idx}>
                <button
                  type="button"
                  className={`gap-2 ${idx === selectedIndex ? "active" : ""}`}
                  disabled={disabled}
                  onClick={() => {
                    onPick(idx);
                    onClose();
                  }}
                >
                  <span className="shrink-0 font-mono text-xs opacity-60">{idx}</span>
                  <span className="truncate">{name}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="flex flex-wrap items-end gap-2">
            <label className="form-control">
              <span className="label-text text-xs">Effect index</span>
              <input
                type="number"
                min={0}
                className="input input-bordered input-sm w-32"
                value={manualIdx}
                onChange={(e) => setManualIdx(e.target.value)}
                disabled={disabled}
              />
            </label>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={disabled}
              onClick={() => {
                onPick(readNumber(manualIdx, 0));
                onClose();
              }}
            >
              Use index
            </button>
          </div>
        )}
        <div className="modal-action mt-0">
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </dialog>
  );
}
