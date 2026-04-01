import { ReactNode, useMemo, useState } from 'react';
import { normalizeImageUrl } from '../../services/groupme';

interface AvatarProps {
  src?: string | null;
  alt: string;
  className: string;
  fallback: ReactNode;
}

export function Avatar({ src, alt, className, fallback }: AvatarProps) {
  const [failed, setFailed] = useState(false);
  const normalizedSrc = useMemo(() => normalizeImageUrl(src), [src]);

  if (!normalizedSrc || failed) {
    return <>{fallback}</>;
  }

  return (
    <img
      src={normalizedSrc}
      alt={alt}
      className={className}
      onError={() => setFailed(true)}
      loading="lazy"
      referrerPolicy="no-referrer"
    />
  );
}
