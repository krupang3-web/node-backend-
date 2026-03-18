const http = require('http');

async function testApi(path, method = 'GET', body = null) {
  const credentials = JSON.stringify({ email: 'admin@neurocry.com', password: 'admin123' });
  
  // 1. Login to get token
  const loginData = await new Promise((resolve, reject) => {
    const req = http.request({
      hostname: 'localhost',
      port: 3001,
      path: '/api/auth/login',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(JSON.parse(data)));
    });
    req.on('error', reject);
    req.write(credentials);
    req.end();
  });

  if (!loginData.success) {
    console.error('Login failed', loginData);
    return;
  }

  const token = loginData.token;

  // 2. Call the requested path
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: 'localhost',
      port: 3001,
      path: path,
      method: method,
      headers: { 
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json' 
      }
    }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(JSON.parse(data)));
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

(async () => {
  console.log('--- Testing Dashboard ---');
  const dash = await testApi('/api/dashboard');
  console.log(JSON.stringify(dash, null, 2));

  console.log('\n--- Testing Patients List ---');
  const patients = await testApi('/api/patients');
  console.log(`Found ${patients.length} patients.`);
  if (patients.length > 0) {
    console.log('First patient snippet:', JSON.stringify(patients[0], null, 2));
  }
})();
