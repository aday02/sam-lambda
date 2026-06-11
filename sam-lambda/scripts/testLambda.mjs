import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';

const lambda = new LambdaClient({ region: 'us-west-2' });

const testCases = [
  { description: 'ANACORTES HENERY HARDWAR ANACORTES WA',           expectedItem: 'Boat_Vehicles', expectedDetail: 'Yacht' },
  { description: 'Amazon.com*TF7J28ZV3 Amzn.com/billWA',            expectedItem: 'Projects_Home', expectedDetail: 'N/A' },
  { description: 'BKOFAMERICA MOBILE 09/16 XXXXX23650 DEPOSIT *MOBILE OR', expectedItem: 'Banking',  expectedDetail: 'Income' },
  { description: 'CREMERIA BRESCIANA PESCARA',                       expectedItem: 'Travel',        expectedDetail: 'Italy' },
  { description: 'TST* JAMBA JUICE - 1256 -WOODBURN OR',            expectedItem: 'Rest_Ent',      expectedDetail: 'Restaurant' },
  { description: 'ALASKA AIR 0272380518241SEATTLE WA',              expectedItem: 'Travel',        expectedDetail: 'N/A' },
  { description: 'DRT PERFORMANCE TIX 706-5501416 GA',              expectedItem: 'Rest_Ent',      expectedDetail: 'Entertainment' },
  { description: 'DORIAN STUDIO. INC 800-826-3535 WA',              expectedItem: 'Kids_Activities', expectedDetail: 'Activities' },
  { description: 'SQ *RIVERSIDE HIGH SCHOOLTualatin OR',            expectedItem: 'Kids_Activities', expectedDetail: 'Activities' },
  { description: 'URBAN OUTFITTERS #85 TIGARD OR',                  expectedItem: 'Kids_Activities', expectedDetail: 'Ashlee' },
  { description: 'AELFRIC EDEN FLAT/RM 1402B',                      expectedItem: 'Kids_Activities', expectedDetail: 'Ashlee' },
  { description: 'AMAZON MARK* RK1D74O41 HTTPSAMAZON.CWA',          expectedItem: 'Projects_Home', expectedDetail: 'N/A' },
  { description: 'Comcast',                                          expectedItem: 'Bills',         expectedDetail: 'Cable' },
  { description: 'AMZN Mktp US*ZT6BK1QV2 Amzn.com/billWA',         expectedItem: 'Projects_Home', expectedDetail: 'N/A' },
  { description: 'EVERYDAY MUSIC PORTLAND OR',                      expectedItem: 'Rest_Ent',      expectedDetail: 'Entertainment' },
  { description: 'Kindle Unltd*4R2HH4H13 888-802-3080 WA',         expectedItem: 'Bills',         expectedDetail: 'Music' },
  { description: 'PEPITO BEACH PESCARA',                            expectedItem: 'Travel',        expectedDetail: 'Italy' },
  { description: 'RIVERSIDE HIGH SCHOOL -ST800-8036755 OR',         expectedItem: 'Kids_Activities', expectedDetail: 'Activities' },
  { description: 'AMERIGAS PROPANE LP KING OF PRUSSPA',             expectedItem: 'Projects_Home', expectedDetail: 'N/A' },
  { description: 'AMZN Mktp US*KJ2797ZR3 Amzn.com/billWA',         expectedItem: 'Boat_Vehicles', expectedDetail: 'Yacht' },
];

console.log('Testing sam-budgetId Lambda\n');
console.log('Description'.padEnd(45), 'Expected'.padEnd(25), 'Got'.padEnd(25), 'Pass?');
console.log('-'.repeat(100));

let passed = 0, failed = 0, undefined_count = 0;

for (const { description, expectedItem, expectedDetail } of testCases) {
  const response = await lambda.send(new InvokeCommand({
    FunctionName: 'sam-budgetId',
    Payload: JSON.stringify({ description })
  }));

  const result = JSON.parse(Buffer.from(response.Payload).toString());
  const body = JSON.parse(result.body);

  const expected = `${expectedItem}/${expectedDetail}`;
  const got = `${body.BudgetItem}/${body.BudgetDetail}`;
  const isUndefined = body.BudgetItem === 'UNDEFINED';
  const pass = body.BudgetItem === expectedItem && body.BudgetDetail === expectedDetail;

  if (pass) passed++;
  else if (isUndefined) undefined_count++;
  else failed++;

  const status = pass ? '✓' : isUndefined ? '?' : '✗';
  console.log(description.substring(0, 44).padEnd(45), expected.padEnd(25), got.padEnd(25), status);
}

console.log(`\nResults: ${passed} passed, ${failed} wrong, ${undefined_count} UNDEFINED out of ${testCases.length}`);
