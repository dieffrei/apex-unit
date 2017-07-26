const jsforce = require('jsforce');
const _ = require('underscore');
const sleep = require('sleep');
const fs = require('fs');

const conn = new jsforce.Connection({
    loginUrl: 'https://test.salesforce.com'
});

const getConnection = async() => {
    return await conn.login("dieffrei.quadros@eu-cosan.com.qa", 'Tobi86!@IXnHqS6Geypr502FEDt3nJGee');
};

const findAllTestClassesIds = async() => {
    return await conn.tooling.sobject('ApexClass').find({}, "Id, Name, SymbolTable").execute();
};

const queryTestExecutionStatus = async(testJobId) => {
    const data = await conn.query('select Id, Status, ApexClassId from ApexTestQueueItem where ParentJobId = \'' + testJobId + '\'')
    var isCompleted = true;
    _.each(data.records, function (row) {
        if (row.Status === 'Queued' || row.Status === 'Processing') {
            isCompleted = false;
        }
    });
    return isCompleted;
};

const calculateCodeCoverage = async() => {
    
    await getConnection();
    const testClasses = await findAllTestClassesIds();
    const testClassIds = _.pluck(testClasses, 'Id');
    console.log('Test classes ' + testClassIds);
    const jobId  = await conn.tooling.runTestsAsynchronous(testClassIds.slice(0,10));
    console.log('Job Id [' + jobId + ']');
    
    while(!await queryTestExecutionStatus(jobId)){
        console.log('Testing is running');
        sleep.sleep(10);
    }

    const codeCoverageResult = await conn.tooling.sobject('ApexCodeCoverage').find({});
    console.log(JSON.stringify(codeCoverageResult));

    await fs.writeFile('code-coverage.json', JSON.stringify(codeCoverageResult))


};

calculateCodeCoverage();