import { DynamoDBClient, ScanCommand } from '@aws-sdk/client-dynamodb';
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';

const dynamo = new DynamoDBClient({ region: 'us-west-2' });
const bedrock = new BedrockRuntimeClient({ region: 'us-west-2' });

const AUTO_CATEGORIZE_THRESHOLD = 0.90;
const CACHE_TTL_MS = 5 * 60 * 1000;

let cachedIndex = null;
let cacheTime = 0;

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

function cosineSimilarity(a, b) {
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

async function buildIndex() {
  const now = Date.now();
  if (cachedIndex && (now - cacheTime) < CACHE_TTL_MS) {
    return cachedIndex;
  }

  const items = [];
  let lastKey;
  do {
    const data = await dynamo.send(new ScanCommand({
      TableName: 'BudgetHistory',
      FilterExpression: 'attribute_exists(embedding)',
      ExclusiveStartKey: lastKey
    }));
    for (const item of data.Items) {
      items.push({
        description: item.Description.S,
        budgetItem: item.BudgetItem.S,
        budgetDetail: item.BudgetDetail.S,
        embedding: JSON.parse(item.embedding.S)
      });
    }
    lastKey = data.LastEvaluatedKey;
  } while (lastKey);

  cachedIndex = items;
  cacheTime = now;
  return cachedIndex;
}

export const handler = async (event) => {
  const { description } = event;

  if (!description) {
    return { statusCode: 400, body: JSON.stringify({ message: 'description required' }) };
  }

  try {
    const [index, queryVec] = await Promise.all([buildIndex(), getEmbedding(description)]);

    if (index.length === 0) {
      return { statusCode: 404, body: JSON.stringify({ message: 'No embeddings found in database' }) };
    }

    const topMatch = index
      .map(row => ({ ...row, similarity: cosineSimilarity(queryVec, row.embedding) }))
      .sort((a, b) => b.similarity - a.similarity)[0];

    return {
      statusCode: 200,
      body: JSON.stringify({
        BudgetItem: topMatch.budgetItem,
        BudgetDetail: topMatch.budgetDetail,
        confidence: topMatch.similarity,
        method: 'embedding_match',
        ...(topMatch.similarity < AUTO_CATEGORIZE_THRESHOLD && { needsReview: true })
      })
    };

  } catch (error) {
    console.error('Error:', error);
    return { statusCode: 500, body: JSON.stringify({ message: 'Internal server error' }) };
  }
};
