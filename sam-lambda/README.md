# sam-budgetId Lambda

A serverless AWS Lambda function that categorizes bank transaction descriptions into budget items using semantic similarity search powered by Amazon Bedrock Titan embeddings.

## Overview

When given a transaction description (e.g. `TST* JAMBA JUICE - WOODBURN OR`), the function searches a DynamoDB table of previously categorized transactions using cosine similarity on 256-dimensional vector embeddings. It returns the best matching budget category or `UNDEFINED` if confidence is too low.

This replaces a previous approach that matched only the first 8 characters of a description — which failed whenever merchant names varied slightly (different store numbers, payment processor prefixes like `SQ *`, `TST*`, `AMZN Mktp US*`, etc.).

---

## Project Structure

```
src/
  handlers/
    samBudgetId.mjs       # Lambda handler
  events/
    event.json            # Test event: SENOR TACO
    event-sq.json         # Test event: SQ *SENOR TACO
    event-tst.json        # Test event: TST* SENOR TACO
scripts/
  backfillEmbeddings.mjs  # One-time: generate embeddings for existing DynamoDB items
  importFromExcel.mjs     # One-time: load categorized transactions from Excel budget file
  testLambda.mjs          # Integration test: invoke deployed Lambda with 20 test cases
template.yaml             # SAM/CloudFormation resource definitions
.samignore                # Excludes scripts/, node_modules/, src/events/ from SAM build
```

---

## DynamoDB Table

**Table name:** `BudgetHistory`
**Billing mode:** On-demand (PAY_PER_REQUEST)
**Primary key:** `Description` (String, partition key)

### Schema

| Attribute | Type | Description |
|---|---|---|
| `Description` | String | Transaction description as it appears on the bank statement |
| `BudgetItem` | String | Top-level budget category (e.g. `Rest_Ent`, `Bills`, `Travel`) |
| `BudgetDetail` | String | Sub-category detail (e.g. `Restaurant`, `Cable`, `Italy`) |
| `embedding` | String | JSON array of 256 floats — Titan embedding of the Description |

The table currently holds **~2,925 entries** sourced from historical bank transactions, each with a pre-computed embedding.

---

## How Embeddings Work

On every invocation the Lambda:

1. **Generates an embedding** for the incoming description by calling Amazon Bedrock (`amazon.titan-embed-text-v2:0`, 256 dimensions)
2. **Loads the full DynamoDB index** into memory (cached for 5 minutes between warm invocations)
3. **Computes cosine similarity** between the query embedding and every stored embedding
4. **Returns the top match** if its similarity score is ≥ 0.70, otherwise returns `UNDEFINED`

### Why 256 dimensions?

Titan V2 supports 256, 512, or 1024 dimensions. 256 was chosen because:
- Short transaction descriptions don't benefit meaningfully from higher dimensions
- Each stored embedding takes ~4.7 KB vs ~18 KB at 1024 dims
- Total table size stays under 15 MB, fast to scan and cache

### Why 0.70 threshold?

Stored descriptions include location suffixes (e.g. `SENOR TACO WEST LINN WEST LINN OR`) while incoming queries are typically shorter (e.g. `SENOR TACO`). This reduces cosine similarity to the 0.70–0.80 range for correct matches. Genuine mismatches score below 0.50.

---

## Lambda Input / Output

**Input event:**
```json
{ "description": "TST* JAMBA JUICE - WOODBURN OR" }
```

**Response (match found):**
```json
{
  "statusCode": 200,
  "body": "{\"BudgetItem\":\"Rest_Ent\",\"BudgetDetail\":\"Restaurant\"}"
}
```

**Response (low confidence):**
```json
{
  "statusCode": 200,
  "body": "{\"BudgetItem\":\"UNDEFINED\",\"BudgetDetail\":\"UNDEFINED\"}"
}
```

---

## Deployment

### Prerequisites

- [AWS SAM CLI](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/serverless-sam-cli-install.html)
- [Node.js 20+](https://nodejs.org/)
- AWS credentials configured locally

### Build and deploy

```bash
sam build
sam deploy --no-confirm-changeset
```

> **Windows note:** If `sam build` fails with `[WinError 5] Access is denied`, delete the `.aws-sam` folder and retry. The `.samignore` file prevents the known problem folders from being copied into the build directory.

### View logs

```bash
aws logs tail "/aws/lambda/sam-budgetId" --region us-west-2 --since 10m
```

---

## Scripts

All scripts are run from the project root (`sam-lambda/`) and require AWS credentials with DynamoDB and Bedrock access.

### Install dependencies

```bash
npm install
```

### `scripts/backfillEmbeddings.mjs`

Generates and stores Titan embeddings for any DynamoDB items that are missing them. Safe to re-run — skips items that already have an embedding.

```bash
node scripts/backfillEmbeddings.mjs
```

### `scripts/importFromExcel.mjs`

Reads an Excel budget file, extracts unique categorized transaction descriptions, and loads new entries into DynamoDB with embeddings. For descriptions with conflicting categories across rows, the most frequently assigned category wins. Skips descriptions already in the table.

```bash
node scripts/importFromExcel.mjs
```

> Update the `EXCEL_PATH` constant at the top of the script to point to your budget file.

### `scripts/testLambda.mjs`

Invokes the **deployed** Lambda function with 20 representative test cases and compares the returned `BudgetItem`/`BudgetDetail` against expected values.

```bash
node scripts/testLambda.mjs
```

Example output:

```
Testing sam-budgetId Lambda

Description                                   Expected                  Got                       Pass?
----------------------------------------------------------------------------------------------------
TST* JAMBA JUICE - 1256 -WOODBURN OR          Rest_Ent/Restaurant       Rest_Ent/Restaurant       ✓
Comcast                                       Bills/Cable               Bills/Cable               ✓
ALASKA AIR 0272380518241SEATTLE WA            Travel/N/A                Travel/N/A                ✓
...
Results: 20 passed, 0 wrong, 0 UNDEFINED out of 20
```

---

## IAM Permissions

The Lambda execution role requires:

| Permission | Purpose |
|---|---|
| `AWSLambdaBasicExecutionRole` | CloudWatch logging |
| `AmazonDynamoDBReadOnlyAccess` | Scan the BudgetHistory table |
| `bedrock:InvokeModel` on `amazon.titan-embed-text-v2:0` | Generate embeddings |
