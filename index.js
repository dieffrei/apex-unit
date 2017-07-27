const jsforce = require('jsforce');
const _ = require('underscore');
const sleep = require('sleep');
const fs = require('fs');
const kale = require('kale');

const conn = new jsforce.Connection({
    loginUrl: 'https://test.salesforce.com'
});

const getConnection = async() => {
    return await conn.login("dieffrei.quadros@eu-cosan.com.qa",
        'Tobi86!@IXnHqS6Geypr502FEDt3nJGee');
};

const findAllTestClassesIds = async() => {
    return await conn.tooling.sobject('ApexClass')
        .find({}, "Id, Name, SymbolTable")
        .execute();
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

/* CODACY CODE COVERAGE FORMAT
{
    "total": 23,
    "fileReports": [
    {
        "filename": "src/Codacy/Coverage/Parser/CloverParser.php",
        "total": 54,
        "coverage": {
            "3": 3,
            "7": 1
        }
    }
]
}
*/
function toCodacyFormat(salesforceCodeCoverageResult) {

    var codacyFormatData = {
        total: 100,
        fileReports: []
    };

    _.each(salesforceCodeCoverageResult, (classCoverage) => {
        
        console.log(classCoverage.ApexClassOrTrigger);
        
        var codacyFormatDataItem = {
            filename: classCoverage.ApexClassOrTrigger.Name,
            total: classCoverage.NumLinesCovered / classCoverage.NumLinesUncovered,
            coverage: {}
        };

        if (classCoverage.Coverage != null) {
            _.each(classCoverage.Coverage.coveredLines, (line) => {
                codacyFormatDataItem.coverage[line] = 1;
            })
        }

        codacyFormatData.fileReports.push(codacyFormatDataItem);
        
    });

    return codacyFormatData;
}

const calculateCodeCoverage = async() => {
    
    await getConnection();
    const testClasses = await findAllTestClassesIds();
    const testClassIds = _.pluck(testClasses, 'Id');
    console.log('Test classes ' + testClassIds);
    const jobId  = await conn.tooling.runTestsAsynchronous(testClassIds.slice(0,1));
    console.log('Job Id [' + jobId + ']');
    
    while(!await queryTestExecutionStatus(jobId)){
        console.log('Testing is running');
        sleep.sleep(1);
    }

    const codeCoverageResults = await conn.tooling.sobject('ApexCodeCoverageAggregate')
        .find({}, 'Id, ApexClassOrTrigger.Name, ApexClassOrTriggerId, NumLinesCovered, NumLinesUncovered, Coverage');

    const json = toCodacyFormat(codeCoverageResults);

    await fs.writeFile('code-coverage.json', JSON.stringify(json));

};

calculateCodeCoverage();