import { ReactNode, useEffect, useRef, useState } from 'react';

interface AppLayoutProps {
  sidebar: ReactNode;
  main: ReactNode;
}

export function AppLayout({ sidebar, main }: AppLayoutProps) {
  const [sidebarWidth, setSidebarWidth] = useState(320);
  const isResizingRef = useRef(false);

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      if (!isResizingRef.current) {
        return;
      }

      const minWidth = 260;
      const maxWidth = Math.min(560, Math.max(320, window.innerWidth - 360));
      const nextWidth = Math.min(Math.max(event.clientX, minWidth), maxWidth);
      setSidebarWidth(nextWidth);
    };

    const handleMouseUp = () => {
      if (!isResizingRef.current) {
        return;
      }

      isResizingRef.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  const handleResizeStart = () => {
    isResizingRef.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  return (
    <div className="relative flex h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-900 dark:to-gray-900">
      <div className="drag-region absolute top-0 left-0 right-0 h-11 z-50" />
      <div
        className="relative bg-white/40 dark:bg-gray-900/60 backdrop-blur-3xl border-r border-gray-200/50 dark:border-gray-700/60 flex flex-col shrink-0"
        style={{ width: `${sidebarWidth}px` }}
      >
        {sidebar}
        <div
          className="absolute top-0 right-0 h-full w-2 cursor-col-resize group z-40"
          onMouseDown={handleResizeStart}
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize sidebar"
        >
          <div className="absolute top-0 bottom-0 right-0 w-px bg-gray-200 dark:bg-gray-700 group-hover:bg-blue-500 transition-colors" />
        </div>
      </div>
      <div className="flex-1 flex flex-col">
        {main}
      </div>
    </div>
  );
}
