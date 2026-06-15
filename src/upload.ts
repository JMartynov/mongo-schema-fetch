import prompts from 'prompts';
import fs from 'fs';
import { logInfo, logError, logDebug } from './logger.js';

export async function autoAnalyze(payloadPath: string, queryFilePath: string): Promise<boolean> {
  console.log(`\n🚀 Auto-analyzing using query file: ${queryFilePath}`);

  if (!fs.existsSync(queryFilePath)) {
    console.error(`❌ Query file not found: ${queryFilePath}`);
    return false;
  }

  const queryContent = fs.readFileSync(queryFilePath, 'utf-8');

  console.log("Uploading schema and query to API (mocking POST request)...");

  // Simulating API POST Request
  await new Promise(resolve => setTimeout(resolve, 800));

  // Mock API logic: fail if query contains "fail_test"
  if (queryContent.includes("fail_test")) {
    console.error("❌ API Analysis returned a failure (e.g., Full Collection Scan detected).");
    return false;
  }

  console.log("✅ API Analysis passed. No degradations found.");
  return true;
}

export async function promptAndUploadMagicLink(payloadPath: string, payloadSizeKb: number): Promise<void> {
  console.log(`\n✅ File ${payloadPath} saved successfully (${payloadSizeKb.toFixed(2)} KB).`);

  const response = await prompts({
    type: 'confirm',
    name: 'upload',
    message: 'Send this schema to Web Optimizer and open browser for analysis? (Data will be uploaded to a temporary secure session)',
    initial: true
  });

  if (response.upload) {
    console.log("Uploading to magic link (mocking POST request)...");

    // Simulating API POST Request
    await new Promise(resolve => setTimeout(resolve, 800));

    const mockUrl = `https://your-platform.com/t/mock-${Date.now()}`;
    console.log(`Opening browser at: ${mockUrl}`);

    // Open in default browser
    const open = (await import('open')).default;
    await open(mockUrl);
  } else {
    console.log("Upload skipped. You can manually upload the file to our platform later.");
  }
}

export async function submitToLiteServer(server: string, payload: any, query: any): Promise<boolean> {
  let serverUrl = server.trim();
  if (!/^https?:\/\//i.test(serverUrl)) {
    serverUrl = `http://${serverUrl}`;
  }
  serverUrl = serverUrl.replace(/\/+$/, '');
  const targetUrl = `${serverUrl}/api/jobs`;

  logDebug(`Preparing to submit payload to local server at: ${targetUrl}`);

  try {
    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        schema: payload,
        query: query
      })
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`Server returned status ${response.status}: ${text}`);
    }

    const data: any = await response.json();
    const jobId = data.id || data.jobId;

    if (!jobId) {
      throw new Error('Response JSON did not contain a valid Job ID ("id" or "jobId")');
    }

    logInfo(`\n✅ Job successfully created! Job ID: ${jobId}`);
    logInfo(`🌐 View live progress and download report: ${serverUrl}/job/${jobId}`);
    return true;
  } catch (error: any) {
    logError(`Error submitting to server: ${error.message}`, error);
    return false;
  }
}

