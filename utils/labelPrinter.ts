/**
 * Label Printer Utility
 * Generates and prints address labels with order details for label printers
 */

export interface LabelData {
  orderId: string;
  customerName: string;
  customerPhone: string;
  dressType: string;
  quantity: number;
}

export interface TailorLabelData {
  tailorName: string;
}

export interface InventoryLabelData {
  itemCode: string;
  itemName: string;
}

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const openPrintWindow = (html: string, title: string): boolean => {
  const printWindow = window.open('', '_blank', 'width=800,height=600');
  if (!printWindow) {
    alert('Unable to open the print dialog. Please allow popups for this app.');
    return false;
  }

  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.document.title = title;

  const triggerPrint = () => {
    try {
      printWindow.focus();
      printWindow.print();
    } catch (error) {
      console.error('Label print failed:', error);
    }
  };

  printWindow.onload = () => {
    window.setTimeout(triggerPrint, 250);
  };
  printWindow.onafterprint = () => {
    printWindow.close();
  };

  window.setTimeout(triggerPrint, 600);
  return true;
};

export const generateLabelHTML = (labelData: LabelData): string => {
  const { orderId, customerName, customerPhone } = labelData;

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        @media print {
          @page {
            size: 2in 1in;
            margin: 0;
          }
          body {
            margin: 0;
            padding: 0;
          }
        }

        body {
          margin: 0;
          padding: 0;
          font-family: 'Arial', sans-serif;
          width: 2in;
          height: 1in;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          text-align: center;
          overflow: hidden;
        }

        .customer-name {
          font-size: 10px;
          font-weight: bold;
          margin-bottom: 2px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          width: 100%;
        }

        .order-id {
          font-size: 22px;
          font-weight: 900;
          margin: 1px 0;
          letter-spacing: -1px;
        }

        .customer-phone {
          font-size: 10px;
          font-weight: bold;
          margin-top: 2px;
        }
      </style>
    </head>
    <body>
      <div class="customer-name">${escapeHtml(customerName.toUpperCase())}</div>
      <div class="order-id">${escapeHtml(orderId)}</div>
      <div class="customer-phone">${escapeHtml(customerPhone)}</div>
    </body>
    </html>
  `;
};

export const printLabel = (labelData: LabelData) => {
  const html = generateLabelHTML(labelData);
  return openPrintWindow(html, `Label-${labelData.orderId}`);
};

export const printLabels = (labelDataList: LabelData[]) => {
  const html = generateMultipleLabels(labelDataList);
  return openPrintWindow(html, 'Order Labels');
};

export const generateMultipleLabels = (labels: LabelData[]): string => {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        @media print {
          @page {
            size: 2in 1in;
            margin: 0;
          }
          body {
            margin: 0;
            padding: 0;
          }
        }

        body {
          margin: 0;
          padding: 0;
          font-family: 'Arial', sans-serif;
        }

        .label-container {
          width: 2in;
          height: 1in;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          text-align: center;
          overflow: hidden;
          page-break-after: always;
          break-after: page;
        }

        .label-container:last-of-type {
          page-break-after: auto;
          break-after: auto;
        }

        .customer-name {
          font-size: 10px;
          font-weight: bold;
          margin-bottom: 2px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          width: 100%;
        }

        .order-id {
          font-size: 22px;
          font-weight: 900;
          margin: 1px 0;
          letter-spacing: -1px;
        }

        .customer-phone {
          font-size: 10px;
          font-weight: bold;
          margin-top: 2px;
        }
      </style>
    </head>
    <body>
      ${labels.map(label => `
        <div class="label-container">
          <div class="customer-name">${escapeHtml(label.customerName.toUpperCase())}</div>
          <div class="order-id">${escapeHtml(label.orderId)}</div>
          <div class="customer-phone">${escapeHtml(label.customerPhone)}</div>
        </div>
      `).join('')}
    </body>
    </html>
  `;
};

export const generateTailorLabelHTML = (tailorName: string): string => {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@700&family=Inter:wght@400;700;900&display=swap');
        
        @media print {
          @page {
            size: 2in 1in;
            margin: 0;
          }
          body {
            margin: 0;
            padding: 0;
          }
        }

        body {
          margin: 0;
          padding: 0;
          font-family: 'Inter', sans-serif;
          width: 2in;
          height: 1in;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          text-align: center;
          overflow: hidden;
          background-color: white;
          border: 2px solid #000;
          box-sizing: border-box;
          padding: 6px;
          position: relative;
        }

        .inner-border {
          position: absolute;
          top: 2px;
          left: 2px;
          right: 2px;
          bottom: 2px;
          border: 0.5px solid #000;
          pointer-events: none;
        }

        .header {
          width: 100%;
          margin-bottom: 2px;
        }

        .tailor-name {
          font-size: 16px;
          font-weight: 950;
          text-transform: uppercase;
          letter-spacing: 1px;
          color: #000;
          margin: 0;
          line-height: 1;
        }

        .sn-box {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 100%;
          margin: 8px 0;
        }

        .sn-label {
          font-size: 12px;
          font-weight: 800;
          display: flex;
          align-items: center;
          gap: 4px;
        }

        .dots {
          border-bottom: 1.5px dotted #000;
          width: 90px;
          height: 14px;
        }

        .footer {
          width: 100%;
          display: flex;
          flex-direction: column;
          align-items: center;
        }

        .brand-name {
          font-family: 'Cinzel', serif;
          font-size: 9px;
          font-weight: 900;
          letter-spacing: 2px;
          color: #000;
          text-transform: uppercase;
          padding: 0 4px;
          background: white;
          z-index: 1;
        }

        .brand-line {
          position: absolute;
          bottom: 12px;
          left: 10px;
          right: 10px;
          height: 0.5px;
          background: #000;
        }

        .corner {
          position: absolute;
          width: 10px;
          height: 10px;
          border-color: #000;
          border-style: solid;
          z-index: 2;
        }
        .top-left { top: 0; left: 0; border-width: 3px 0 0 3px; }
        .top-right { top: 0; right: 0; border-width: 3px 3px 0 0; }
        .bottom-left { bottom: 0; left: 0; border-width: 0 0 3px 3px; }
        .bottom-right { bottom: 0; right: 0; border-width: 0 3px 3px 0; }
      </style>
    </head>
    <body>
      <div class="inner-border"></div>
      <div class="corner top-left"></div>
      <div class="corner top-right"></div>
      <div class="corner bottom-left"></div>
      <div class="corner bottom-right"></div>
      
      <div class="header">
        <div class="tailor-name">${escapeHtml(tailorName.toUpperCase())}</div>
      </div>
      
      <div class="sn-box">
        <div class="sn-label">ORD-NO: <span class="dots"></span></div>
      </div>
      
      <div class="footer">
        <div class="brand-line"></div>
        <div class="brand-name">VIP Tailors & Fashion</div>
      </div>
    </body>
    </html>
  `;
};

export const printTailorLabel = (tailorName: string) => {
  const html = generateTailorLabelHTML(tailorName);
  return openPrintWindow(html, `Tailor-Label-${tailorName}`);
};

const CODE39_PATTERNS: Record<string, string> = {
  '0': 'nnnwwnwnn',
  '1': 'wnnwnnnnw',
  '2': 'nnwwnnnnw',
  '3': 'wnwwnnnnn',
  '4': 'nnnwwnnnw',
  '5': 'wnnwwnnnn',
  '6': 'nnwwwnnnn',
  '7': 'nnnwnnwnw',
  '8': 'wnnwnnwnn',
  '9': 'nnwwnnwnn',
  A: 'wnnnnwnnw',
  B: 'nnwnnwnnw',
  C: 'wnwnnwnnn',
  D: 'nnnnwwnnw',
  E: 'wnnnwwnnn',
  F: 'nnwnwwnnn',
  G: 'nnnnnwwnw',
  H: 'wnnnnwwnn',
  I: 'nnwnnwwnn',
  J: 'nnnnwwwnn',
  K: 'wnnnnnnww',
  L: 'nnwnnnnww',
  M: 'wnwnnnnwn',
  N: 'nnnnwnnww',
  O: 'wnnnwnnwn',
  P: 'nnwnwnnwn',
  Q: 'nnnnnnwww',
  R: 'wnnnnnwwn',
  S: 'nnwnnnwwn',
  T: 'nnnnwnwwn',
  U: 'wwnnnnnnw',
  V: 'nwwnnnnnw',
  W: 'wwwnnnnnn',
  X: 'nwnnwnnnw',
  Y: 'wwnnwnnnn',
  Z: 'nwwnwnnnn',
  '-': 'nwnnnnwnw',
  '.': 'wwnnnnwnn',
  ' ': 'nwwnnnwnn',
  '*': 'nwnnwnwnn',
};

const toCode39Value = (value: string): string => {
  const normalized = value
    .toUpperCase()
    .replace(/[^A-Z0-9 .-]/g, '-')
    .trim();
  return `*${normalized || 'ITEM'}*`;
};

const generateCode39Svg = (value: string): string => {
  const encoded = toCode39Value(value);
  const narrow = 2;
  const wide = 5;
  const height = 44;
  let x = 0;
  let bars = '';

  encoded.split('').forEach((char, charIndex) => {
    const pattern = CODE39_PATTERNS[char] || CODE39_PATTERNS['-'];
    pattern.split('').forEach((token, index) => {
      const isBar = index % 2 === 0;
      const width = token === 'w' ? wide : narrow;
      if (isBar) {
        bars += `<rect x="${x}" y="0" width="${width}" height="${height}" fill="#000" />`;
      }
      x += width;
    });
    if (charIndex < encoded.length - 1) {
      x += narrow;
    }
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${x}" height="${height}" viewBox="0 0 ${x} ${height}" preserveAspectRatio="none">${bars}</svg>`;
};

export const generateInventoryLabelHTML = (labelData: InventoryLabelData): string => {
  const itemCode = labelData.itemCode.trim().toUpperCase() || 'ITEM';
  const itemName = labelData.itemName.trim().toUpperCase() || 'MATERIAL';
  const barcodeSvg = generateCode39Svg(itemCode);

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        @media print {
          @page {
            size: 2in 1in;
            margin: 0;
          }
          body {
            margin: 0;
            padding: 0;
          }
        }

        body {
          margin: 0;
          padding: 0;
          width: 2in;
          height: 1in;
          font-family: Arial, sans-serif;
          box-sizing: border-box;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #fff;
        }

        .label {
          width: 1.92in;
          height: 0.92in;
          border: 1px solid #000;
          box-sizing: border-box;
          padding: 4px 6px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          overflow: hidden;
        }

        .code {
          font-size: 11px;
          font-weight: 900;
          letter-spacing: 0.08em;
          text-align: center;
          white-space: nowrap;
        }

        .name {
          font-size: 9px;
          font-weight: 700;
          text-align: center;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .barcode {
          height: 44px;
          width: 100%;
        }

        .barcode svg {
          width: 100%;
          height: 100%;
          display: block;
        }
      </style>
    </head>
    <body>
      <div class="label">
        <div class="code">${escapeHtml(itemCode)}</div>
        <div class="barcode">${barcodeSvg}</div>
        <div class="name">${escapeHtml(itemName)}</div>
      </div>
    </body>
    </html>
  `;
};

export const printInventoryLabel = (labelData: InventoryLabelData) => {
  const html = generateInventoryLabelHTML(labelData);
  return openPrintWindow(html, `Inventory-Label-${labelData.itemCode}`);
};
