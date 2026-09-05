import { useState } from 'react';

export function CopyButton({
  url,
  className,
  label = 'Copier',
  copiedLabel = 'Copie !',
}: {
  url: string;
  className?: string;
  label?: string;
  copiedLabel?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button
      type="button"
      onClick={() => void handleCopy()}
      className={
        className ??
        'shrink-0 bg-ink text-on-primary font-button-md rounded px-md'
      }
    >
      {copied ? copiedLabel : label}
    </button>
  );
}
