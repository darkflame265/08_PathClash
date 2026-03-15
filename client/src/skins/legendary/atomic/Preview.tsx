import "./preview.css";

interface AtomicPreviewProps {
  ready: boolean;
}

export function AtomicPreview({ ready }: AtomicPreviewProps) {
  return (
    <span className={`skin-preview-atomic-atom ${ready ? "atomic-preview-ready" : ""}`}>
      <span className="skin-preview-atomic-nucleus" />
      <span className="skin-preview-atomic-electron skin-preview-atomic-electron-1">
        <span className="skin-preview-atomic-electron-ring">
          <span className="skin-preview-atomic-electron-particle" />
        </span>
      </span>
      <span className="skin-preview-atomic-electron skin-preview-atomic-electron-2">
        <span className="skin-preview-atomic-electron-ring">
          <span className="skin-preview-atomic-electron-particle" />
        </span>
      </span>
      <span className="skin-preview-atomic-electron skin-preview-atomic-electron-3">
        <span className="skin-preview-atomic-electron-ring">
          <span className="skin-preview-atomic-electron-particle" />
        </span>
      </span>
    </span>
  );
}
