import { DynamoDBClient, PutItemCommand, ScanCommand } from '@aws-sdk/client-dynamodb';
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const XLSX = require('../node_modules/xlsx/xlsx.js');

const dynamo = new DynamoDBClient({ region: 'us-west-2' });
const bedrock = new BedrockRuntimeClient({ region: 'us-west-2' });

const EXCEL_PATH = 'C:/Users/aday0/OneDrive/Documents/Reading/2025_budget.xlsx';

async function getEmbedding(text) {
  const response = await bedrock.send(new InvokeModelCommand({
    modelId: 'amazon.titan-embed-text-v2:0',
    contentType: 'application/json',
    accept: 'application/json',
    body: JSON.stringify({ inputText: text, dimensions: 256 })
  }));
  return JSON.parse(Buffer.from(response.body).toString()).embedding;
}

function extractUniqueDescriptions() {
  const wb = XLSX.readFile(EXCEL_PATH);
  const ws = wb.Sheets['Accounts'];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });

  // Tally category votes per description
  const votes = new Map();
  rows.slice(6).forEach(row => {
    const desc = row[3], item = row[5], detail = row[6];
    if (!desc || !item || !detail || typeof desc !== 'string') return;
    if (item === 'Unbudgeted') return;

    const key = `${item}|||${detail}`;
    if (!votes.has(desc)) votes.set(desc, new Map());
    const tally = votes.get(desc);
    tally.set(key, (tally.get(key) || 0) + 1);
  });

  // Pick most frequent category for each description
  const result = [];
  for (const [desc, tally] of votes) {
    const [topKey] = [...tally.entries()].sort((a, b) => b[1] - a[1])[0];
    const [budgetItem, budgetDetail] = topKey.split('|||');
    result.push({ description: desc, budgetItem, budgetDetail });
  }
  return result;
}

async function getExistingDescriptions() {
  const existing = new Set();
  let lastKey;
  do {
    const data = await dynamo.send(new ScanCommand({
      TableName: 'BudgetHistory',
      ProjectionExpression: 'Description',
      ExclusiveStartKey: lastKey
    }));
    data.Items.forEach(item => existing.add(item.Description.S));
    lastKey = data.LastEvaluatedKey;
  } while (lastKey);
  return existing;
}

async function run() {
  console.log('Reading Excel file...');
  const entries = extractUniqueDescriptions();
  console.log(`Found ${entries.length} unique categorized descriptions.`);

  console.log('Checking existing DynamoDB items...');
  const existing = await getExistingDescriptions();
  console.log(`DynamoDB already has ${existing.size} items.`);

  const toAdd = entries.filter(e => !existing.has(e.description));
  console.log(`New entries to add: ${toAdd.length}\n`);

  let success = 0, failed = 0;

  for (let i = 0; i < toAdd.length; i++) {
    const { description, budgetItem, budgetDetail } = toAdd[i];
    try {
      const embedding = await getEmbedding(description);

      await dynamo.send(new PutItemCommand({
        TableName: 'BudgetHistory',
        Item: {
          Description: { S: description },
          BudgetItem: { S: budgetItem },
          BudgetDetail: { S: budgetDetail },
          embedding: { S: JSON.stringify(embedding) }
        }
      }));

      success++;
      if (success % 50 === 0 || i === toAdd.length - 1) {
        console.log(`Progress: ${i + 1}/${toAdd.length} (${failed} errors)`);
      }

      await new Promise(r => setTimeout(r, 50));
    } catch (err) {
      failed++;
      console.error(`Failed on "${description}": ${err.message}`);
    }
  }

  console.log(`\nDone. ${success} added, ${failed} failed.`);
}

run();
