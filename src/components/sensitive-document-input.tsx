"use client";

import type { InputHTMLAttributes } from "react";
import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

type SensitiveDocumentInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  revealLabel?: string;
  hideLabel?: string;
};

export function SensitiveDocumentInput({
  className,
  revealLabel = "Mostrar documento",
  hideLabel = "Ocultar documento",
  ...props
}: SensitiveDocumentInputProps) {
  const [revealed, setRevealed] = useState(false);
  const inputClassName = [
    "sensitive-input-control",
    revealed ? "sensitive-input-control-visible" : "sensitive-input-control-blurred",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="sensitive-input">
      <input
        {...props}
        className={inputClassName}
        spellCheck={false}
        type="text"
      />
      <button
        aria-label={revealed ? hideLabel : revealLabel}
        className="sensitive-input-toggle"
        type="button"
        onClick={() => setRevealed((current) => !current)}
      >
        {revealed ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}
