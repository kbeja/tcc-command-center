import { useState } from 'react';
import CaptureField from './CaptureField';

export default function CaptureButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button className="floating-capture" onClick={() => setOpen(true)} aria-label="Capture spark">
        +
      </button>
      {open && <CaptureField onClose={() => setOpen(false)} />}
    </>
  );
}
