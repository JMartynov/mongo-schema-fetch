import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const certsDir = path.join(process.cwd(), 'test', 'certs');

export function getCertPaths() {
  return {
    certsDir,
    caPem: path.join(certsDir, 'ca.pem'),
    caKey: path.join(certsDir, 'ca.key'),
    serverPem: path.join(certsDir, 'server.pem'),
    serverKey: path.join(certsDir, 'server.key'),
    serverCrt: path.join(certsDir, 'server.crt'),
    clientPem: path.join(certsDir, 'client.pem'),
    clientKey: path.join(certsDir, 'client.key'),
    clientCrt: path.join(certsDir, 'client.crt'),
    clientEncPem: path.join(certsDir, 'client_enc.pem'),
  };
}

export function generateCerts() {
  const paths = getCertPaths();
  if (fs.existsSync(paths.serverPem) && fs.existsSync(paths.caPem) && fs.existsSync(paths.clientPem)) {
    return;
  }
  fs.mkdirSync(certsDir, { recursive: true });

  try {
    // 1. Generate CA key and certificate
    execSync(
      `openssl req -new -x509 -days 365 -nodes -out "${paths.caPem}" -keyout "${paths.caKey}" -subj "/CN=TestCA"`,
      { stdio: 'pipe' }
    );

    // 2. Generate Server key and CSR
    execSync(
      `openssl req -new -nodes -out "${path.join(certsDir, 'server.csr')}" -keyout "${paths.serverKey}" -subj "/CN=localhost"`,
      { stdio: 'pipe' }
    );

    // 3. Sign Server certificate with SAN for localhost and 127.0.0.1
    const extFile = path.join(certsDir, 'server.ext');
    fs.writeFileSync(extFile, 'subjectAltName=DNS:localhost,IP:127.0.0.1,IP:0.0.0.0\n');

    execSync(
      `openssl x509 -req -in "${path.join(certsDir, 'server.csr')}" -CA "${paths.caPem}" -CAkey "${paths.caKey}" -CAcreateserial -out "${paths.serverCrt}" -days 365 -extfile "${extFile}"`,
      { stdio: 'pipe' }
    );

    // 4. Combine server key and certificate into server.pem
    const serverKeyContent = fs.readFileSync(paths.serverKey, 'utf8');
    const serverCrtContent = fs.readFileSync(paths.serverCrt, 'utf8');
    fs.writeFileSync(paths.serverPem, serverKeyContent + '\n' + serverCrtContent, 'utf8');

    // 5. Generate Client key and CSR
    execSync(
      `openssl req -new -nodes -out "${path.join(certsDir, 'client.csr')}" -keyout "${paths.clientKey}" -subj "/CN=client"`,
      { stdio: 'pipe' }
    );

    // 6. Sign Client certificate
    execSync(
      `openssl x509 -req -in "${path.join(certsDir, 'client.csr')}" -CA "${paths.caPem}" -CAkey "${paths.caKey}" -CAcreateserial -out "${paths.clientCrt}" -days 365`,
      { stdio: 'pipe' }
    );

    // 7. Combine client key and certificate into client.pem
    const clientKeyContent = fs.readFileSync(paths.clientKey, 'utf8');
    const clientCrtContent = fs.readFileSync(paths.clientCrt, 'utf8');
    fs.writeFileSync(paths.clientPem, clientKeyContent + '\n' + clientCrtContent, 'utf8');

    // 8. Generate password-encrypted Client key and CSR
    execSync(
      `openssl req -new -nodes -out "${path.join(certsDir, 'client_enc.csr')}" -keyout "${path.join(certsDir, 'client_enc.key')}" -subj "/CN=client_enc"`,
      { stdio: 'pipe' }
    );
    // Encrypt client key with password "testpassword"
    execSync(
      `openssl rsa -in "${path.join(certsDir, 'client_enc.key')}" -out "${path.join(certsDir, 'client_enc_pass.key')}" -aes256 -passout pass:testpassword`,
      { stdio: 'pipe' }
    );
    // Sign Client certificate
    execSync(
      `openssl x509 -req -in "${path.join(certsDir, 'client_enc.csr')}" -CA "${paths.caPem}" -CAkey "${paths.caKey}" -CAcreateserial -out "${path.join(certsDir, 'client_enc.crt')}" -days 365`,
      { stdio: 'pipe' }
    );
    // Combine encrypted key and certificate into client_enc.pem
    const encKeyContent = fs.readFileSync(path.join(certsDir, 'client_enc_pass.key'), 'utf8');
    const encCrtContent = fs.readFileSync(path.join(certsDir, 'client_enc.crt'), 'utf8');
    fs.writeFileSync(paths.clientEncPem, encKeyContent + '\n' + encCrtContent, 'utf8');

  } catch (err: any) {
    console.error('Failed to generate certificates:', err.stderr?.toString() || err.message);
    throw err;
  }
}

export function cleanupCerts() {
  if (fs.existsSync(certsDir)) {
    fs.rmSync(certsDir, { recursive: true, force: true });
  }
}
