'use client';

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { useUi } from '@/components/ui';

/**
 * Getting the public display onto the classroom TV used to mean typing a game
 * id with a remote control. Scanning a QR code from the moderator's phone is
 * the whole setup step, so it lives everywhere the moderator might need it.
 */
export default function PublicScreenCard({ gameId, compact }: { gameId: string; compact?: boolean }) {
  const ui = useUi();
  const [dataUrl, setDataUrl] = useState('');
  const [url, setUrl] = useState('');

  useEffect(() => {
    const link = window.location.origin + '/public/' + encodeURIComponent(gameId);
    setUrl(link);
    QRCode.toDataURL(link, {
      width: 320,
      margin: 1,
      color: { dark: '#0b1020', light: '#ffffff' }
    }).then(setDataUrl).catch(() => setDataUrl(''));
  }, [gameId]);

  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
      ui.toast('คัดลอก' + what + 'แล้ว', 'good');
    } catch {
      ui.toast('คัดลอกไม่สำเร็จ กรุณากดค้างที่ข้อความเพื่อคัดลอกเอง', 'bad');
    }
  };

  return (
    <div className={compact ? '' : 'card2'}>
      {!compact && <h5>📺 จอสาธารณะ</h5>}
      <p className="hint">สแกนด้วยเครื่องที่ต่อกับทีวี ไม่ต้องพิมพ์รหัสเกม — จอนี้ไม่แสดงความลับของผู้เล่นที่ยังมีชีวิต</p>
      {dataUrl
        ? <img className="qr" src={dataUrl} alt={'QR สำหรับเปิดจอสาธารณะของเกม ' + gameId} />
        : <div className="hint">กำลังสร้าง QR…</div>}
      <div className="qr-url">{url}</div>
      <div className="row-gap mt-2">
        <button className="btn-ghost w-100" onClick={() => copy(url, 'ลิงก์จอสาธารณะ')}>คัดลอกลิงก์</button>
        <a className="btn-ghost w-100" style={{ textAlign: 'center' }}
           href={'/public/' + encodeURIComponent(gameId)} target="_blank" rel="noreferrer">เปิดดู</a>
      </div>
    </div>
  );
}
