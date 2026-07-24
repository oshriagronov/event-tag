import React from 'react';

export interface PCloudIconProps {
  className?: string;
  alt?: string;
}

/**
 * Official pCloud logo icon component.
 * Uses official brand color (#139EFB).
 */
export const PCloudIcon: React.FC<PCloudIconProps> = ({
  className = "w-5 h-5",
  alt = "pCloud",
}) => {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={alt}
    >
      <path
        d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM12 18H6c-2.21 0-4-1.79-4-4 0-2.05 1.53-3.76 3.56-3.97l1.07-.11.5-.95C8.08 7.14 9.94 6 12 6c2.62 0 4.88 1.86 5.39 4.43l.3 1.5 1.53.11c1.56.1 2.78 1.41 2.78 2.96 0 1.65-1.35 3-3 3h-7v-3h2l-3-3.5L8 15h2v3z"
        fill="#139EFB"
      />
    </svg>
  );
};

export default PCloudIcon;
