const http = require('http');

const data = JSON.stringify({
  email: 'admin@neurocry.com',
  password: 'admin123'
});

const options = {
  hostname: 'localhost',
  port: 3001,
  path: '/api/auth/login',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length
  }
};

const req = http.request(options, res => {
  let body = '';
  res.on('data', d => body += d);
  res.on('end', () => {
    console.log('STATUS:', res.statusCode);
    console.log('BODY:', body);
    process.exit(res.statusCode === 200 ? 0 : 1);
  });
});

req.on('error', e => {
  console.error(e);
  process.exit(1);
});

req.write(data);
req.end();
