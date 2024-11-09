# sam-lambda
This is is a test project using AWS SAM and Docker Desktop to create the budgetId Lambda with the SAM interface.

*Note: I messed up initially and created the SAM project directory (sam-lambda) inside my GIT Repo folder.  

\sam-lambda:  Directory created by *sam init* command.
\sam-lambda\src:  Location of lambda .mjs file along with the handler
Lambda Name: sam-budgetId as specified in the temaplate.yaml.

* Build Command: from \sam-lambda folder type sam build
* Deploy Command: sam deploy
* Test Localling:  sam local invoke sambudgetId -e .\src\events\event.json
Note:  Test event is in \src\events\event.jsoon


