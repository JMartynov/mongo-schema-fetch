#!/usr/bin/env node

import { Command } from 'commander';
import { connectToDb, fetchServerContext, getCollectionNames, fetchCollectionStats, fetchCollectionIndexes } from './db.js';
import { inferSchema } from './schema.js';
import { validatePayload } from './validation.js';
import { promptForCollections } from './interactive.js';
import { promptAndUploadMagicLink, autoAnalyze } from './upload.js';
import fs from 'fs';
import path from 'path';

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
  .action(async (uri, options) => {
    if (options.autoAnalyze && !options.queryFile) {
      console.error("❌ Error: --query-file must be provided when using --auto-analyze");
      process.exit(1);
    }
    let client;
    try {
      const dbConnection = await connectToDb(uri, options.readPreference);
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

        const stats = await fetchCollectionStats(db, collName);
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
