export function renderStatusPage(res, detail = 'Panier des Sens — VP activation') {
  const safeDetail = String(detail)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  res.status(200).setHeader('Content-Type', 'text/html; charset=utf-8');
  res.end(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>VP Activation</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: system-ui, -apple-system, sans-serif;
      background: #f6f6f4;
      color: #1a1a1a;
    }
    main {
      text-align: center;
      padding: 2rem;
    }
    .status {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 1.125rem;
      font-weight: 600;
    }
    .dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: #2d6a4f;
      box-shadow: 0 0 0 4px rgba(45, 106, 79, 0.2);
    }
    p {
      margin: 0.75rem 0 0;
      font-size: 0.9rem;
      color: #555;
    }
  </style>
</head>
<body>
  <main>
    <div class="status"><span class="dot" aria-hidden="true"></span> Service is running</div>
    <p>${safeDetail}</p>
  </main>
</body>
</html>`);
}
