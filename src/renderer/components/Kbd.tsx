import React from 'react';
import { acceleratorKeys, isMacPlatform } from '../hotkey';

/** An Electron accelerator shown as key caps, e.g. Ctrl + Shift + S. */
export default function Kbd({ accelerator }: { accelerator: string }) {
  const keys = acceleratorKeys(accelerator, isMacPlatform());
  return (
    <span className="inline-flex items-center gap-1 align-middle">
      {keys.map((key, index) => (
        <kbd key={`${key}-${index}`} className="kbd">
          {key}
        </kbd>
      ))}
    </span>
  );
}
