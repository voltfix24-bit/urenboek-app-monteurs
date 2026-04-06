import { useRef, useEffect, useState, useCallback } from 'react';

interface Props {
  onSave: (base64: string) => void;
  bestaande?: string;
  readonly?: boolean;
  hoogte?: number;
}

export function HandtekeningCanvas({ onSave, bestaande, readonly = false, hoogte = 150 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isEmpty, setIsEmpty] = useState(!bestaande);
  const lastPos = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    canvas.width = canvas.offsetWidth * 2;
    canvas.height = hoogte * 2;
    ctx.scale(2, 2);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.offsetWidth, hoogte);

    if (!bestaande) {
      ctx.font = '14px sans-serif';
      ctx.fillStyle = '#d0d0d0';
      ctx.textAlign = 'center';
      ctx.fillText('Teken hier je handtekening', canvas.offsetWidth / 2, hoogte / 2);
    }

    if (bestaande) {
      const img = new Image();
      img.onload = () => {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.offsetWidth, hoogte);
        ctx.drawImage(img, 0, 0, canvas.offsetWidth, hoogte);
      };
      img.src = bestaande;
    }

    ctx.strokeStyle = '#1a1a2e';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }, [bestaande, hoogte]);

  const getPos = useCallback((e: MouseEvent | Touch, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  }, []);

  const clearHint = useCallback(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    if (isEmpty) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.offsetWidth, hoogte);
      ctx.strokeStyle = '#1a1a2e';
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
    }
  }, [isEmpty, hoogte]);

  function startDraw(e: React.MouseEvent | React.TouchEvent) {
    if (readonly) return;
    clearHint();
    setIsDrawing(true);
    setIsEmpty(false);
    const canvas = canvasRef.current!;
    const ev = 'touches' in e ? e.touches[0] : e.nativeEvent as MouseEvent;
    lastPos.current = getPos(ev, canvas);
  }

  function draw(e: React.MouseEvent | React.TouchEvent) {
    if (!isDrawing || readonly) return;
    e.preventDefault();
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    const ev = 'touches' in e ? e.touches[0] : e.nativeEvent as MouseEvent;
    const pos = getPos(ev, canvas);
    ctx.beginPath();
    ctx.moveTo(lastPos.current!.x, lastPos.current!.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    lastPos.current = pos;
  }

  function endDraw() {
    setIsDrawing(false);
    lastPos.current = null;
  }

  function wissen() {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.offsetWidth, hoogte);
    ctx.font = '14px sans-serif';
    ctx.fillStyle = '#d0d0d0';
    ctx.textAlign = 'center';
    ctx.fillText('Teken hier je handtekening', canvas.offsetWidth / 2, hoogte / 2);
    setIsEmpty(true);
  }

  function opslaan() {
    if (isEmpty) return;
    const canvas = canvasRef.current!;
    onSave(canvas.toDataURL('image/png'));
  }

  return (
    <div className="space-y-2">
      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)', background: '#fff' }}>
        <canvas
          ref={canvasRef}
          style={{ width: '100%', height: hoogte, touchAction: 'none', cursor: readonly ? 'default' : 'crosshair' }}
          onMouseDown={startDraw}
          onMouseMove={draw}
          onMouseUp={endDraw}
          onMouseLeave={endDraw}
          onTouchStart={startDraw}
          onTouchMove={draw}
          onTouchEnd={endDraw}
        />
      </div>
      {!readonly && (
        <div className="flex gap-2">
          <button onClick={wissen} className="flex-1 py-2 rounded-lg text-xs font-medium" style={{ border: '1px solid var(--border)', color: 'var(--text-muted)', background: 'var(--bg-surface)' }}>
            ✕ Wissen
          </button>
          <button onClick={opslaan} className="flex-1 py-2 rounded-lg text-xs font-medium" style={{ background: isEmpty ? 'var(--bg-surface-2)' : 'var(--accent)', color: isEmpty ? 'var(--text-muted)' : '#fff', border: 'none', opacity: isEmpty ? 0.5 : 1 }} disabled={isEmpty}>
            ✓ Handtekening gebruiken
          </button>
        </div>
      )}
    </div>
  );
}
