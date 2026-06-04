#!/usr/bin/env node

import { Command } from 'commander';
import { connectToDb, fetchServerContext, getCollectionNames, fetchCollectionStats, fetchCollectionIndexes } from './db.js';
import { inferSchema } from './schema.js';
import { validatePayload } from './validation.js';
import { promptForCollections } from './interactive.js';
import { promptAndUploadMagicLink, autoAnalyze } from './upload.js';
import fs from 'fs';
import path from 'path';
import prompts from 'prompts';

const program = new Command();

program
  .name('mongo-schema-fetch')
  .description('Securely extract MongoDB schema blueprints without exporting real data.')
  .argument('<uri>', 'MongoDB Connection URI')
  .option('--db <name>', 'Database name to override URI db')
  .option('--collections <list>', 'Comma-separated list of collections to scan')
  .option('--all-collections', 'Force scan all collections without prompt')
  .option('--out <path>', 'Output file path', 'schema-payload.json')
  .option('--sample <number>', 'Custom sample limit for schema inference', parseInt)
  .option('--enum-threshold <number>', 'Threshold for saving enum values', parseInt, 20)
  .option('--read-preference <mode>', 'Read preference for Replica Sets (e.g. secondary)')
  .option('--quiet', 'Disable all interactive prompts (CI/CD mode)')
  .option('--query-file <path>', 'Path to a JSON file containing the query to analyze')
  .option('--auto-analyze', 'Automatically send the schema and query to the API and exit based on results')
  .option('--additional', 'Collect additional plan cache and latency stats', false)
  .option('-u, --username <username>', 'MongoDB username')
  .option('-p, --password [password]', 'MongoDB password')
  .option('--auth-source <database>', 'Database containing user credentials')
  .option('--auth-mechanism <mechanism>', 'Authentication mechanism')
  .option('--auth-mechanism-properties <properties>', 'Authentication mechanism properties')
  .option('--tls', 'Enable TLS/SSL connection')
  .option('--tls-ca-file <path>', 'Path to the CA certificate file')
  .option('--tls-certificate-key-file <path>', 'Path to the client PEM certificate key file')
  .option('--tls-certificate-key-file-password <password>', 'Password for the client certificate key file')
  .option('--tls-allow-invalid-certificates', 'Allow invalid certificates (insecure)')
  .option('--tls-allow-invalid-hostnames', 'Allow invalid hostnames in certificates (insecure)')
  .option('--connect-timeout-ms <ms>', 'Connection timeout in milliseconds')
  .option('--socket-timeout-ms <ms>', 'Socket timeout in milliseconds')
  .option('--server-selection-timeout-ms <ms>', 'Server selection timeout in milliseconds')
  .option('--max-idle-time-ms <ms>', 'Connection max idle time in pool')
  .option('--max-pool-size <size>', 'Connection pool max size')
  .option('--min-pool-size <size>', 'Connection pool min size')
  .option('--app-name <name>', 'Application name identifier')
  .option('--retry-writes', 'Enable retryable writes')
  .option('--no-retry-writes', 'Disable retryable writes')
  .option('--retry-reads', 'Enable retryable reads')
  .option('--no-retry-reads', 'Disable retryable reads')
  .option('--direct-connection', 'Force direct connection')
  .option('--no-direct-connection', 'Do not force direct connection')
  .option('--load-balanced', 'Enable load balanced topology')
  .option('--compressors <list>', 'Comma-separated compression algorithms')
  .option('--write-concern-w <w>', 'Write concern w parameter')
  .option('--write-concern-j', 'Enable write concern journal parameter')
  .option('--no-write-concern-j', 'Disable write concern journal parameter')
  .option('--write-concern-wtimeout-ms <ms>', 'Write concern wtimeoutMS parameter')
  .option('--read-concern-level <level>', 'Read concern level')
  .action(async (uri, options) => {
    if (options.autoAnalyze && !options.queryFile) {
      console.error("❌ Error: --query-file must be provided when using --auto-analyze");
      process.exit(1);
    }
    let client;
    try {
      let password = options.password;
      if (password === undefined) {
        password = process.env.MONGODB_PASSWORD || process.env.MONGODB_PASS;
      }
      if (options.username && password === undefined && !options.quiet) {
        const response = await prompts({
          type: 'password',
          name: 'pwd',
          message: `Enter password for MongoDB user "${options.username}":`,
        });
        password = response.pwd;
      }

      let writeConcernW = options.writeConcernW;
      if (writeConcernW !== undefined) {
        if (/^\d+$/.test(writeConcernW)) {
          writeConcernW = parseInt(writeConcernW, 10);
        }
      }

      const connectionOptions = {
        readPreference: options.readPreference,
        username: options.username,
        password,
        authSource: options.authSource,
        authMechanism: options.authMechanism,
        authMechanismProperties: options.authMechanismProperties,
        tls: options.tls,
        tlsCAFile: options.tlsCaFile,
        tlsCertificateKeyFile: options.tlsCertificateKeyFile,
        tlsCertificateKeyFilePassword: options.tlsCertificateKeyFilePassword,
        tlsAllowInvalidCertificates: options.tlsAllowInvalidCertificates,
        tlsAllowInvalidHostnames: options.tlsAllowInvalidHostnames,
        connectTimeoutMS: options.connectTimeoutMs !== undefined ? parseInt(options.connectTimeoutMs, 10) : undefined,
        socketTimeoutMS: options.socketTimeoutMs !== undefined ? parseInt(options.socketTimeoutMs, 10) : undefined,
        serverSelectionTimeoutMS: options.serverSelectionTimeoutMs !== undefined ? parseInt(options.serverSelectionTimeoutMs, 10) : undefined,
        maxIdleTimeMS: options.maxIdleTimeMs !== undefined ? parseInt(options.maxIdleTimeMs, 10) : undefined,
        maxPoolSize: options.maxPoolSize !== undefined ? parseInt(options.maxPoolSize, 10) : undefined,
        minPoolSize: options.minPoolSize !== undefined ? parseInt(options.minPoolSize, 10) : undefined,
        appName: options.appName,
        retryWrites: options.retryWrites,
        retryReads: options.retryReads,
        directConnection: options.directConnection,
        loadBalanced: options.loadBalanced,
        compressors: options.compressors ? options.compressors.split(',').map((s: string) => s.trim()) : undefined,
        w: writeConcernW,
        journal: options.writeConcernJ,
        wtimeoutMS: options.writeConcernWtimeoutMs !== undefined ? parseInt(options.writeConcernWtimeoutMs, 10) : undefined,
        readConcernLevel: options.readConcernLevel,
      };

      const dbConnection = await connectToDb(uri, connectionOptions);
      client = dbConnection.client;
      let db = dbConnection.db;

      if (options.db) {
        db = client.db(options.db);
      }

      console.log(`📡 Connected to MongoDB database: ${db.databaseName}`);

      const serverContext = await fetchServerContext(db);

      let targetCollections: string[] = [];

      const allCollections = await getCollectionNames(db);

      if (options.collections) {
         targetCollections = options.collections.split(',').map((c: string) => c.trim());
      } else if (options.allCollections || options.quiet) {
         targetCollections = allCollections;
      } else {
         targetCollections = await promptForCollections(allCollections);
      }

      if (targetCollections.length === 0) {
        console.log("No collections selected. Exiting.");
        process.exit(0);
      }

      console.log(`\n🔍 Scanning ${targetCollections.length} collections...`);
      const collectionsData = [];

      for (const collName of targetCollections) {
        if (!allCollections.includes(collName)) {
           console.warn(`⚠️ Collection '${collName}' not found in database. Skipping.`);
           continue;
        }

        console.log(`  -> Processing: ${collName}`);

        const stats = await fetchCollectionStats(db, collName, { additional: options.additional });
        const indexes = await fetchCollectionIndexes(db, collName);
        const schema = await inferSchema(db, collName, stats.avgObjSize, options.sample, options.enumThreshold);

        collectionsData.push({
          stats,
          indexes,
          schema
        });
      }

      const payload = {
        serverContext,
        collections: collectionsData
      };

      if (!validatePayload(payload)) {
        console.error("Payload failed schema validation. Exiting.");
        process.exit(1);
      }

      const outPath = path.resolve(options.out);
      const jsonContent = JSON.stringify(payload, null, 2);
      fs.writeFileSync(outPath, jsonContent, 'utf-8');

      // Detect if --out was explicitly provided rather than defaulting
      const outWasExplicit = process.argv.includes('--out') || process.argv.some(arg => arg.startsWith('--out='));

      if (options.autoAnalyze) {
         console.log(`\n✅ File saved to ${outPath}`);
         const success = await autoAnalyze(outPath, options.queryFile);
         if (!success) {
            process.exit(1);
         }
      } else if (!options.quiet && !outWasExplicit) {
        const stats = fs.statSync(outPath);
        const sizeKb = stats.size / 1024;
        await promptAndUploadMagicLink(outPath, sizeKb);
      } else {
         console.log(`\n✅ File saved to ${outPath}`);
      }

    } catch (error: any) {
      console.error("\n❌ Error:", error.message || error);
      process.exit(1);
    } finally {
      if (client) {
        await client.close();
      }
    }
  });

program.parse(process.argv);
