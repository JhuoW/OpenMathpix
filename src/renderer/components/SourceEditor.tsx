import React from 'react';

interface SourceEditorProps {
  value: string;
  onChange: (value: string) => void;
  label: string;
  minRows?: number;
  autoFocus?: boolean;
}

/** A monospace editor that grows with its content up to a comfortable height. */
export default function SourceEditor({
  value,
  onChange,
  label,
  minRows = 2,
  autoFocus,
}: SourceEditorProps) {
  const ref = React.useRef<HTMLTextAreaElement>(null);
  React.useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    element.style.height = 'auto';
    element.style.height = `${Math.min(element.scrollHeight + 2, 320)}px`;
  }, [value]);
  return (
    <textarea
      ref={ref}
      aria-label={label}
      value={value}
      rows={minRows}
      spellCheck={false}
      autoCapitalize="off"
      autoCorrect="off"
      autoFocus={autoFocus}
      onChange={(event) => onChange(event.target.value)}
      className="block w-full resize-none rounded-md border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60 px-3 py-2 font-mono text-[13px] leading-relaxed focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white dark:focus:bg-gray-800"
    />
  );
}
