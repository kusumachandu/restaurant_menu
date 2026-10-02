'use client';
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

export default function QrCard() {
  const [url, setUrl] = useState('');
  const [png, setPng] = useState('');

  useEffect(() => { setUrl(window.location.origin); }, []);
  useEffect(() => {
    if (url) QRCode.toDataURL(url, { width: 640, margin: 2, errorCorrectionLevel: 'M' }).then(setPng).catch(() => setPng(''));
  }, [url]);

  return (
    <div className="form">
      <h2>Table QR code</h2>
      <label>Menu address (use your live domain)<input value={url} onChange={(e) => setUrl(e.target.value)} /></label>
      {png && <img className="qr" src={png} alt="QR code for the menu" />}
      {png && <a className="btnlink" href={png} download="menu-qr.png">Download PNG</a>}
      <p className="hint">Print this on table tents. The code never changes, so you only print it once.</p>
    </div>
  );
}
