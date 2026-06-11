import { DynamoDBClient, ScanCommand, UpdateItemCommand } from '@aws-sdk/client-dynamodb';
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';

const dynamo = new DynamoDBClient({ region: 'us-west-2' });
const bedrock = new BedrockRuntimeClient({ region: 'us-west-2' });

async function getEmbedding(text) {
  const response = await bedrock.send(new InvokeModelCommand({
    modelId: 'amazon.titan-embed-text-v2:0',
    contentType: 'application/json',
    accept: 'application/json',
    body: JSON.stringify({ inputText: text, dimensions: 256 })
  }));
  const result = JSON.parse(Buffer.from(response.body).toString());
  return result.embedding;
}

async function getAllItems() {
  const items = [];
  let lastKey;
  do {
    const data = await dynamo.send(new ScanCommand({
      TableName: 'BudgetHistory',
      ExclusiveStartKey: lastKey
    }));
    items.push(...data.Items);
    lastKey = data.LastEvaluatedKey;
  } while (lastKey);
  return items;
}

async function run() {
  console.log('Scanning BudgetHistory table...');
  const items = await getAllItems();

  const toProcess = items.filter(item => !item.embedding);
  console.log(`Found ${items.length} total items, ${toProcess.length} need embeddings.`);

  let success = 0;
  let failed = 0;

  for (let i = 0; i < toProcess.length; i++) {
    const item = toProcess[i];
    const description = item.Description.S;

    try {
      const embedding = await getEmbedding(description);

      await dynamo.send(new UpdateItemCommand({
        TableName: 'BudgetHistory',
        Key: { Description: { S: description } },
        UpdateExpression: 'SET embedding = :e',
        ExpressionAttributeValues: { ':e': { S: JSON.stringify(embedding) } }
      }));

      success++;
      if (success % 50 === 0 || i === toProcess.length - 1) {
        console.log(`Progress: ${i + 1}/${toProcess.length} (${failed} errors)`);
      }

      // Avoid Bedrock rate limiting
      await new Promise(r => setTimeout(r, 50));
    } catch (err) {
      failed++;
      console.error(`Failed on "${description}": ${err.message}`);
    }
  }

  console.log(`\nDone. ${success} succeeded, ${failed} failed.`);
}

run();
