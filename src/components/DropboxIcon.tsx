import React from 'react';

export interface DropboxIconProps {
  className?: string;
  alt?: string;
  variant?: 'brand' | 'white' | 'current';
}

/**
 * Clean, official Dropbox Glyph vector logo complying strictly with Dropbox Brand Guidelines.
 * Official brand color: Dropbox Blue (#0061FE).
 */
export const DropboxIcon: React.FC<DropboxIconProps> = ({
  className = "w-4 h-4 shrink-0",
  alt = "Dropbox",
  variant = 'brand'
}) => {
  const fillColor = variant === 'brand' ? '#0061FE' : variant === 'white' ? '#FFFFFF' : 'currentColor';

  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      aria-label={alt}
      role="img"
    >
      <path
        d="M6 1.807L0 5.629l6 3.822 6.001-3.822L6 1.807zM18 1.807l-6 3.822 6 3.822 6-3.822-6-3.822zM0 13.274l6 3.822 6.001-3.822L6 9.452l-6 3.822zM18 9.452l-6 3.822 6 3.822 6-3.822-6-3.822zM6 18.371l6.001 3.822 6-3.822-6-3.822L6 18.371z"
        fill={fillColor}
      />
    </svg>
  );
};

export default DropboxIcon;
