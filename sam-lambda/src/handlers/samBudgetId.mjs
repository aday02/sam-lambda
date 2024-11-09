import { DynamoDBClient, ScanCommand } from '@aws-sdk/client-dynamodb';

const client = new DynamoDBClient({ region: 'us-west-2' });

export const handler = async (event) => {
  const description = event.description; // Extract description from the event
  const first8Chars = description.substring(0, 8); // Get the first 8 characters

  // Define the parameters for the DynamoDB query
  const params = {
    TableName: 'BudgetHistory', // Your DynamoDB table name
    FilterExpression: 'begins_with(Description, :first8Chars)', // Use begins_with for scanning
    ExpressionAttributeValues: {
      ':first8Chars': { S: first8Chars } // Match the first 8 characters
    }
  };

  try {
    // Execute the scan operation
    const data = await client.send(new ScanCommand(params));

    // Check if any items are returned
    if (data.Items && data.Items.length > 0) {
      // Extract the first matching item
      const item = data.Items[0];
      
      // Extract BudgetItem and BudgetDetail from the item
      const budgetItem = item.BudgetItem.S;
      const budgetDetail = item.BudgetDetail.S;
      
      // Return the results
      return {
        statusCode: 200,
        body: JSON.stringify({
          BudgetItem: budgetItem,
          BudgetDetail: budgetDetail
        })
      };
    } else {
      // No matching item found
      return {
        statusCode: 404,
        body: JSON.stringify({ message: 'No matching item found' })
      };
    }
  } catch (error) {
    console.error('Error querying DynamoDB:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Internal server error' })
    };
  }
};
