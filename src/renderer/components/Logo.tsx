import React from 'react';
import icon from '../../../build/icon.svg';
import smallIcon from '../../../build/icon-small.svg';

/** The application icon; small sizes use the artwork drawn to stay legible with few pixels. */
export default function Logo({ size = 20, className = '' }: { size?: number; className?: string }) {
  return (
    <img
      src={size <= 32 ? smallIcon : icon}
      width={size}
      height={size}
      alt=""
      aria-hidden="true"
      draggable={false}
      className={`shrink-0 ${className}`}
    />
  );
}
