import React, { useCallback } from 'react';

export default function ResizableTh({
  columnKey,
  width,
  onResize,
  onReset,
  children,
  style = {},
  className = '',
  ...rest
}) {
  const handleMouseDown = useCallback(
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      const startX = e.clientX;
      const startW = width;

      const onMove = (ev) => {
        onResize?.(columnKey, startW + (ev.clientX - startX));
      };

      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        document.body.classList.remove('crm-resizing-col');
      };

      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      document.body.classList.add('crm-resizing-col');
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    },
    [columnKey, onResize, width],
  );

  const handleDoubleClick = useCallback(
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      onReset?.(columnKey);
    },
    [columnKey, onReset],
  );

  return (
    <th
      {...rest}
      className={`crm-resizable-th ${className}`.trim()}
      style={{
        ...style,
        width,
        minWidth: width,
        maxWidth: width,
        overflow: 'hidden',
      }}
    >
      <div className="crm-resizable-th__label">{children}</div>
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize column"
        title="Drag to resize column · Double-click to reset"
        className="col-resize-handle"
        onMouseDown={handleMouseDown}
        onDoubleClick={handleDoubleClick}
        onClick={(e) => e.stopPropagation()}
      />
    </th>
  );
}
