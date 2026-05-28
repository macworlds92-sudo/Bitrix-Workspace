export default function handler(req, res) {
  // Bitrix24 handshake — отвечаем 200 на любой метод
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  // Возвращаем HTML с редиректом на основное приложение
  res.setHeader('Content-Type', 'text/html');
  res.status(200).send(`
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <script>
          // Передаём параметры Bitrix24 в основное приложение
          const params = window.location.search;
          window.location.href = '/' + params;
        </script>
      </head>
      <body>Загрузка...</body>
    </html>
  `);
}
