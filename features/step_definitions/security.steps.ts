import { Given, When, Then } from '@cucumber/cucumber';
import { getTestMongoUri, getTestDbName, getTestOutPath, getTestRunExitCode, setTestRunExitCode, getIsTlsScenario, getIsX509Scenario } from './cli.steps.js';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import assert from 'assert';
import { getCertPaths } from '../../test/certs-helper.js';

const verifierPath = path.join(process.cwd(), 'features-verifier.json');

Given('the database is populated with PII emulation data using mongo-synth', () => {
  const mongoUri = getTestMongoUri();
  const dbName = getTestDbName();
  
  let synthUri = mongoUri;
  if (getIsTlsScenario()) {
    const paths = getCertPaths();
    const tlsParams = [];
    tlsParams.push('tls=true');
    tlsParams.push(`tlsCAFile=${encodeURIComponent(paths.caPem)}`);
    tlsParams.push(`tlsCertificateKeyFile=${encodeURIComponent(paths.clientPem)}`);
    tlsParams.push('tlsAllowInvalidHostnames=true');
    tlsParams.push('tlsAllowInvalidCertificates=true');

    if (getIsX509Scenario()) {
      tlsParams.push('authMechanism=MONGODB-X509');
      tlsParams.push('authSource=%24external');
    }

    const separator = synthUri.includes('?') ? '&' : '?';
    synthUri = `${synthUri}${separator}${tlsParams.join('&')}`;
  }

  const synthCmd = `./.venv-synth/bin/mongo-synth generate --inject-sensitive --schema features/security-schema.json --verifier-output "${verifierPath}" --uri "${synthUri}" --db "${dbName}" --collection "users" --count 100 --clear`;
  try {
    execSync(synthCmd, { stdio: 'pipe' });
  } catch (err: any) {
    console.error("mongo-synth execution failed:", err.stderr?.toString() || err.message);
    throw err;
  }
});

When('I run mongo-schema-fetch with maximal security testing options', () => {
  const mongoUri = getTestMongoUri();
  const dbName = getTestDbName();
  const outPath = getTestOutPath();
  try {
    // --enum-threshold 1000 ensures that the CLI attempts to collect enums for all fields (maximal verbose option)
    const cmd = `node dist/cli.js "${mongoUri}" --db ${dbName} --out ${outPath} --quiet --enum-threshold 1000 --sample 1000 --all-collections`;
    execSync(cmd, { stdio: 'pipe' });
    setTestRunExitCode(0);
  } catch (err: any) {
    setTestRunExitCode(err.status ?? 1);
    console.error("CLI Execution failed:", err.stderr?.toString() || err.message);
  }
});

When('I run mongo-schema-fetch with TLS, mutual authentication, and maximal security testing options', () => {
  const mongoUri = getTestMongoUri();
  const dbName = getTestDbName();
  const outPath = getTestOutPath();
  const paths = getCertPaths();
  try {
    const cmd = `node dist/cli.js "${mongoUri}" --db ${dbName} --out ${outPath} --quiet --tls --tls-ca-file "${paths.caPem}" --tls-certificate-key-file "${paths.clientPem}" --enum-threshold 1000 --sample 1000 --all-collections`;
    execSync(cmd, { stdio: 'pipe' });
    setTestRunExitCode(0);
  } catch (err: any) {
    setTestRunExitCode(err.status ?? 1);
    console.error("CLI Execution failed:", err.stderr?.toString() || err.message);
  }
});

When('I run mongo-schema-fetch with TLS, MONGODB-X509 authentication, and maximal security testing options', () => {
  const mongoUri = getTestMongoUri();
  const dbName = getTestDbName();
  const outPath = getTestOutPath();
  const paths = getCertPaths();
  try {
    const cmd = `node dist/cli.js "${mongoUri}" --db ${dbName} --out ${outPath} --quiet --tls --tls-ca-file "${paths.caPem}" --tls-certificate-key-file "${paths.clientPem}" --auth-mechanism MONGODB-X509 --auth-source '$external' --enum-threshold 1000 --sample 1000 --all-collections`;
    execSync(cmd, { stdio: 'pipe' });
    setTestRunExitCode(0);
  } catch (err: any) {
    setTestRunExitCode(err.status ?? 1);
    console.error("CLI Execution failed:", err.stderr?.toString() || err.message);
  }
});

Then('the output payload should not contain any PII from the verifiers list', () => {
  const outPath = getTestOutPath();
  assert.ok(fs.existsSync(outPath), "Output payload file does not exist");
  assert.ok(fs.existsSync(verifierPath), "Verifier file does not exist");

  const payloadString = fs.readFileSync(outPath, 'utf8');
  const verifiers = JSON.parse(fs.readFileSync(verifierPath, 'utf8'));

  for (const item of verifiers) {
    const value = item.value?.toString().trim();
    // Case-insensitive substring check of all verifier values (filtering out length <= 3 to avoid false positives)
    if (value && value.length > 3) {
      if (payloadString.toLowerCase().includes(value.toLowerCase())) {
        assert.fail(`Security Leak Detected: PII value "${value}" of type "${item.type}" was found in the schema blueprint payload!`);
      }
    }
  }
  
  // Cleanup verifier file
  try {
    fs.unlinkSync(verifierPath);
  } catch (e) {}
});

Then('the output payload should pass validation by py-secret-scan', () => {
  const outPath = getTestOutPath();
  assert.ok(fs.existsSync(outPath), "Output payload file does not exist");

  // Load payload and isolate collections to avoid false positives on public buildInfo commit hashes or compiler flags in serverContext
  const payload = JSON.parse(fs.readFileSync(outPath, 'utf8'));
  const tempScanPath = path.join(process.cwd(), 'features-payload-scan.json');
  fs.writeFileSync(tempScanPath, JSON.stringify({ collections: payload.collections }, null, 2));

  // Run py-secret-scan via command-line using our custom rules database on the collections schema data
  const scanCmd = `./.venv-scan/bin/secret-scan --pii --data-dir test/security/data --threshold 4.5 --full --fail-on-risk MEDIUM "${tempScanPath}"`;
  try {
    execSync(scanCmd, { stdio: 'pipe' });
  } catch (err: any) {
    const output = err.stdout?.toString() || err.stderr?.toString() || err.message;
    assert.fail(`py-secret-scan failed. Detected secrets/PII in the schema blueprint payload. Output:\n${output}`);
  } finally {
    try {
      if (fs.existsSync(tempScanPath)) {
        fs.unlinkSync(tempScanPath);
      }
    } catch (e) {}
  }
});
